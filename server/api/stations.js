
'use strict';

/**

 Backend API for elasticache-geospatial-fuel-finder Pipeline Software in the Cloud application for Team 4.

 date: Oct 2018

 */

const dataUrl = "https://s3.amazonaws.com/leidalk-pipeline-capstone/alt_fuel_stations.json";
const region = "us-east-1";
const elasticacheHost = "teamfourelasticache.lethum.ng.0001.use1.cache.amazonaws.com";
const elasticachePort = "6379";
const waypointLambda = "Group4_FuelFinder_GetWaypoint";
const listSearchRadius = 50;
const listSearchRadiusUnits = "mi";
const listResultCount = 10;
const dynamoDbTable = "leidalk-alt-fuel-stations";


const aws = require('aws-sdk');
aws.config.update({region: region});
const documentClient = new aws.DynamoDB.DocumentClient();
const lambda = new aws.Lambda({
    region: `${region}`
});
const redis = require('redis');
const client = redis.createClient({
    host: elasticacheHost,
    port: elasticachePort
});
client.on("error", (error) => {
    console.error('[ERROR] REDIS CONNECTION ERROR: ' + error);
});

//---- Shared Functions ----
const buildResponse = (statusCode, body) => {

    return {
        statusCode: statusCode,
        body: JSON.stringify(body),
        headers: {
            "Content-Type": "application/json"
        }
    };

};


/**
 * Retrieves all stations within specified distance of the passed coordinates.
 * Sample request query string:
 * zip=06551
 */
module.exports.list = (event, context, callback) => {

    let zip = event.zip;
    let radius = event.radius;
    let radiusUnits = event.radius_units;
    // TODO Are we doing this?
    // var fuelType = event.fuel_type_code;
    let latitude = null;
    let longitude = null;

    if (zip == null || zip === undefined) {
        callback(null, buildResponse(400, {"message": "Missing required parameter: ZIP"}));
        return;
    } else {
        let params = {postalCode: `${zip}`};
        lambda.invoke({
            FunctionName: `${waypointLambda}`,
            Payload: JSON.stringify(params, null, 2),
            InvocationType: 'RequestResponse'
        }, function (error, data) {
            if (error) {
                console.log("Error invoking lambda, '" + waypointLambda + "'. ERROR: " + error);
                // context.done('error', error);
            }
            if (data.Payload) {
                // context.succeed(data.Payload);
                let coordinates = JSON.parse(data.Payload.toString());
                longitude = coordinates.longitude;
                latitude = coordinates.latitude;
            }
        });

        if (!(longitude && latitude)) {
            callback(null, buildResponse(400, {"message": "Could not find the coordinates from the ZIP code: " + zip}));
            return;
        }

    }

    //TODO Are we doing this?
    // if(fuelType == null || fuelType == undefined) {
    //     callback(null, buildResponse( 400, { "message": "Missing required parameter: ZIP" } ));
    //     return;
    // }

    if (radius == null || radius === undefined) {
        radius = listSearchRadius;
    }

    if (radiusUnits == null || radiusUnits === undefined) {
        radiusUnits = listSearchRadiusUnits;
    }

    client.send_command('GEORADIUS',
        ['fuel-finder:stations',
            longitude,
            latitude,
            radius,
            radiusUnits,
            'WITHDIST',
            'WITHCOORD',
            'COUNT',
            listResultCount], (error, reply) => {
            client.quit();

            if (error) {
                console.error("[ERROR - checkins#create] Elasticache query error: " + error);
                callback(null, buildResponse(500, "Unable to find alternative fuel stations in the given radius."));
                return;
            }

            let stations = reply.map((redisResponse) => {
                let params = {
                    TableName: dynamoDbTable,
                    FilterExpression: `#id = ${redisResponse[0]}`,
                    ProjectionExpression: "fuel_type_code, station_name, street_address, city, #s, zip, station_phone, latitude, longitude",
                    ExpressionAttributeNames: '{"#s": "state"}'
                };

                // TODO How do I get the data?
                let data = documentClient.scan(params, onScan);
                if (data.length === 0) {
                    data.push(defaultData);
                }
                return {
                    id: Number(redisResponse[0]),
                    fuel_type_code: `${data[0].fuel_type_code}`,
                    station_name: `${data[0].station_name}`,
                    station_phone: `${data[0].station_phone}`,
                    street_address: `${data[0].street_address}`,
                    city: `${data[0].city}`,
                    state: `${data[0].state}`,
                    zip: `${data[0].zip}`,
                    latitude: Number(redisResponse[2][1]),
                    longitude: Number(redisResponse[2][0]),
                    distance: `${redisResponse[1]}`,
                    distance_units: `${radiusUnits}`
                };
            });

            callback(null, buildResponse(200, stations));
        });
};

/**
 * a default response record in case something goes wrong.
 *
 * @type {{fuel_type_code: string, station_name: string, station_phone: string, street_address: string, city: string, state: string, zip: string}}
 */
const defaultData = {
    fuel_type_code: "UNK",
    station_name: "Unknown",
    station_phone: "000-000-0000",
    street_address: "123 Fake St.",
    city: "Anywhere",
    state: "NY",
    zip: "12345"
};

/**
 * A callback handler for calls to DynamoDB.
 */
const onScan = (err, data) => {
    if (err) {
        console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
    } else {
        let count = data.Items.length;
        console.log("rows selected: " + count);
        return data;
    }
};

/**
 * Retrieves alternative fuel stations JSON file from the given URL and returns it to the caller.
 */
const getStationData = (url) => {
    return new Promise((resolve, reject) => {
        const https = require('https');
        const request = https.get(url, (response) => {
            if (response.statusCode < 200 || response.statusCode >= 300) {
                reject(new Error("Could not load stations data, status code: " + response.statusCode));
            }

            const data = [];
            response.on('data', (chunk) => data.push(chunk));
            response.on('end', () => {
                try {
                    const json = JSON.parse(data.join(""));
                    resolve(json);
                } catch (error) {
                    reject(error);
                }
            });

        });

        request.on('error', (error) => reject(error));

    });
};

/**
 * Given the station data JSON object, this method will store location information ot the redis cache for each record.
 * @param data the data object containing a list of stations
 */
const storeStationData = (data) => {
    let maxIndex = data.length;

    for (let i = 0; i < maxIndex; i++) {
        let record = data[i];
        let id = `${record.id}`;
        updateRecord(client, id, record)
            .then((result) => {
                //no-op
            })
            .catch((error) => {
                console.error("Unable to add record to redis. Error: " + error);
                return(error);
            });
    }
};

/**
 * Given the redis client, a fuel station ID and a fuel station record.
 * @param client the redis client
 * @param id the station id
 * @param record a single station record
 * @returns {Promise<any>}
 */
const updateRecord = (client, id, record) => {
    return new Promise( (resolve, reject) => {

        client.send_command('GEOADD',
            [ 'fuel-finder:stations',
                record.longitude.N,
                record.latitude.N,
                id ], (error, reply) => {
                if (error) {
                    reject(error);
                }
                else {
                    console.log("Inserted new entry in cache for " + id + " { lat:" + record.latitude.N + ", lon: " + record.longitude.N + " }" );
                    resolve(reply);
                }
            });

    });
};


/**
 * Sets up the data in the elasticache redis data structure from the JSON data file.
 */
module.exports.setup = (event, context, callback) => {

    getStationData(dataUrl)
        .then((data) => {
           return storeStationData(data);
        })
        .then((result) => {
            console.log(result);
            callback(null, buildResponse(200, {"message": "Setup complete"}));
        })
        .catch((error) => {
            console.error(error);
            callback(error);
        });
};



