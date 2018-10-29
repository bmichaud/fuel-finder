# fuel-finder
Capstone AWS cloud project 
This project was created based largely on the AWS lab project, https://github.com/awslabs/elasticache-geospatial-public-bikes.git.

It was done purely as an internal training exercise and is not for public consumption. The YAML files for cloud formation will not work (were not used) and neither was the stream processor except as a reference.

## Infrastructure
1. s3 bucket
    * Contains files:
        * index.html
        * favicon.ico
        * alt_fuel_stations.json
    * configured for static web site hosting

2. Lambda
    * All configured with the same execution role, which has AWSLambdaVPCAccessExecutionRole
    * get-route (Python) Uses the Here API (integrated into AWS)
    * get-waypoint Uses the Here API (integrated into AWS)
    * find-stations (depends on get-waypoint for direct call)

3. API gateway
    * /stations GET maps to the find-stations Node.js Lambda
        * Integration Request
            * Content-Type: application/json
            ```
            {
                "zip":  "$input.params('zip')",
                "radius":  "$input.params('radius')",
                "radius_units":  "$input.params('radius_units')"
            }
            ```
        * GET Method response
            * HTTP Status 200 Headers:
                * Access-Control-Allow-Origin (this could be tightened up to allow only what is necessary)
                ```
                {
                  "Access-Control-Allow-Origin": "*"
                }
                ```
                * Content-Type: application/json
        * Environment Variables:
            | Name                  | Value                                                                 |
            | ----------------------| ----------------------------------------------------------------------|
            | DATA_URL              | https://s3.amazonaws.com/sic-team-4-fuel-finder/alt_fuel_stations.json|
            | REGION                | us-east-1                                                             |
            | RESULT_COUNT          | 15                                                                    |
            | SEARCH_RADIUS         | 50                                                                    |
            | SEARCH_RADIUS_UNITS   | mi                                                                    |
            | WAYPOINT_LAMBDA       | Group4_FuelFinder_GetWaypoint                                         |

    * /getroute GET maps to the get-route lambda (currently called Group4_FuelFinder_GetRoute)
        * Integration Request
            * Content-Type: application/json
            ```
            {
                "waypoint0":  "$input.params('waypoint0')",
                "waypoint1":  "$input.params('waypoint1')"
            }
            ```
        * GET method response
            * HTTP status 200 Headers
                * Same as above
## Experimental set-up with Elasticache and Redis
    * elasticache-experimental