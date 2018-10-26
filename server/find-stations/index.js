'use strict';

/**

 Backend API for geospatial fuel-finder Pipeline Software in the Cloud application for Team 4.

 date: Oct 2018

 */

// const dataUrl = "https://s3.amazonaws.com/leidalk-pipeline-capstone/alt_fuel_stations.json";
// const dataUrl = "https://s3.amazonaws.com/sic-team-4-fuel-finder/alt_fuel_stations.json";
// const region = "us-east-1";
// const waypointLambda = "Group4_FuelFinder_GetWaypoint";
// const listSearchRadius = 50;
// const listSearchRadiusUnits = "mi";
// const listResultCount = 10;
const dataUrl = process.env.DATA_URL;
const region = process.env.REGION;
const waypointLambda = process.env.WAYPOINT_LAMBDA;
const listSearchRadius = process.env.SEARCH_RADIUS;
const listSearchRadiusUnits = process.env.SEARCH_RADIUS_UNITS;
const listResultCount = process.env.RESULT_COUNT;


const aws = require('aws-sdk');
aws.config.update({region: region});
const lambda = new aws.Lambda({
    region: `${region}`
});
const geolib = require('geolib');

//---- Shared Functions ----
const buildResponse = (statusCode, body) => {

    return {
        statusCode: statusCode,
        body: JSON.stringify(body),
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"  // Equivalent to Enabling COARS
        },
        isBase64Encoded: false
    };

};


/**
 * Retrieves all stations within specified distance of the passed coordinates.
 * Sample request query string: (optional parameters in square brackets)
 * zip=06551[&radius=15[&radius_units=km]]
 */
module.exports.list = (event, context, callback) => {

    let zip = event.zip;

    if (zip == null || zip === undefined) {
        callback(null, buildResponse(400, {"message": "Missing required parameter: ZIP"}));
    } else {
        let params = {postalCode: `${zip}`};
        lambda.invoke({
            FunctionName: `${waypointLambda}`,
            Payload: JSON.stringify(params, null, 2),
            InvocationType: 'RequestResponse'
        }, function (error, data) {
            if (error) {
                let msg = "Error invoking lambda, '" + waypointLambda + "'. ERROR: " + error;
                console.log(msg);
                callback(null, buildResponse(400, {"message": msg}));
                // context.done('error', error);
            }

            if (data.Payload) {
                // context.succeed(data.Payload);
                let coordinates = JSON.parse(data.Payload.toString());
                if (!(coordinates.longitude && coordinates.latitude)) {
                    callback(null, buildResponse(400, {"message": "Could not find the coordinates from the ZIP code: " + zip}));
                } else {

                    // TODO Are we doing this?
                    // var fuelType = event.fuel_type_code;
                    // if(fuelType == null || fuelType == undefined) {
                    //     callback(null, buildResponse( 400, { "message": "Missing required parameter: ZIP" } ));
                    //     return;
                    // }

                    let radius = event.radius;
                    if (radius == null || radius === undefined || !isPosInt(radius)) {
                        radius = listSearchRadius;
                    } else {
                        radius = parseInt(radius.trim());
                    }

                    let radiusUnits = event.radius_units;
                    if (radiusUnits == null || radiusUnits === undefined || (radiusUnits.trim() !== 'km') || (radiusUnits.trim() !== 'mi')) {
                        radiusUnits = listSearchRadiusUnits;
                    } else {
                        radiusUnits = radiusUnits.trim();
                    }

                    let radiusInMeters = radiusToMeters(radius, radiusUnits);
                    getStationData(dataUrl)
                        .then((data) => {
                            return getStationsInRadius(data, coordinates, radiusInMeters, radiusUnits);
                        })
                        .then((stations) => {

                            let finalResult = {
                                origin: {
                                    zip: `${zip}`,
                                    latitude: coordinates.latitude,
                                    longitude: coordinates.longitude
                                },
                                fuel_stations: stations.length = Math.min(stations.length, listResultCount)
                            };
                            console.log(finalResult);
                            callback(null, buildResponse(200, finalResult));
                        })
                        .catch((error) => {
                            console.error(error);
                            callback(null, buildResponse(500, error));
                        });
                }
            }
        });

    }

};

const posIntRegex = /^\d+$/;

function isPosInt(n) {
    let isPosInt = false;
    let num = n.trim();
    if (num.length > 0) {
        isPosInt = posIntRegex.test(num);
    }
    return isPosInt;
}

const kmToM = 1000;
const miToM = 1609;

/**
 * Converts the given radius to meters.
 *
 * @param radius validated radius value converted to a positive integer or defaulted
 * @param radiusUnits a string: E {'km', 'mi'}
 * @returns {float} the given radius converted into meters
 */
function radiusToMeters(radius, radiusUnits) {
    let radiusInMeters = 0;
    if (radiusUnits === 'km') {
        radiusInMeters = radius * kmToM;
    } else if (radiusUnits === 'mi') {
        radiusInMeters = radius * miToM;
    } else {
        radiusInMeters = radius * miToM;
    }
    return radiusInMeters;
}

/**
 * Converts the given distance from meters to the radius units.
 *
 * @param distInMeters distance value in meters to be converted
 * @param radiusUnits a string: E {'km', 'mi'}
 * @returns {float} the given radius converted into meters
 */
function metersToRadiusUnits(distInMeters, radiusUnits) {
    let distInRadiusUnits = 0;
    if (radiusUnits === 'km') {
        distInRadiusUnits = distInMeters / kmToM;
    } else if (radiusUnits === 'mi') {
        distInRadiusUnits = distInMeters / miToM;
    } else {
        distInRadiusUnits = distInMeters / miToM;
    }
    return distInRadiusUnits;
}


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
 * Given the station data JSON object, this method will find the nearest 10 stations in the given radius
 * and return them in an array of JSON objects, each representing a station.
 *
 * @param data all the stations
 * @param coordinates origin coordinates
 * @param radiusInMeters radius value
 * @param radiusUnits radius units: E {'mi', 'km'}
 * @returns {Array} of station objects sorted by distance
 */
const getStationsInRadius = (data, coordinates, radiusInMeters, radiusUnits) => {
    let stationsInRadius = [];
    let allStations = ((data != null) && (data !== undefined) ? data.fuel_stations : []);
    for (let i = 0; i < allStations.length; i++) {
        let station = allStations[i];
        if ((station.latitude !== null) && (station.latitude !== undefined) && (station.longitude !== null) && (station.longitude !== undefined)) {
            let stationCoords = {latitude: station.latitude, longitude: station.longitude};
            let distance = geolib.getDistance(coordinates, stationCoords);
            if (distance <= radiusInMeters) {
                stationsInRadius.push({
                    id: station.id,
                    fuel_type_code: `${station.fuel_type_code}`,
                    station_name: `${station.station_name}`,
                    station_phone: `${station.station_phone}`,
                    street_address: `${station.street_address}`,
                    city: `${station.city}`,
                    state: `${station.state}`,
                    zip: `${station.zip}`,
                    latitude: stationCoords.latitude,
                    longitude: stationCoords.longitude,
                    distance: metersToRadiusUnits(distance, radiusUnits),
                    distance_units: `${radiusUnits}`
                });
            }
        }
    }
    return stationsInRadius.sort(function (a, b) {
        return a.distance - b.distance;
    });
};
