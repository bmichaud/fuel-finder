import boto3
from botocore.vendored import requests
import json

def lambda_handler(event, context):

    #param1 sample
    #event['waypoint0']="geo!28.45526,-81.49125"

    #param2 sample
    #event['waypoint1']="geo!28.5775896,-81.4195271"

    URL = "https://route.api.here.com/routing/7.2/calculateroute.json?app_id=SzQ6I7hVBKixDDZ1kQ89&app_code=m2l6yujtfr__ovqwf3ixJg&waypoint0=" + event['waypoint0'] + "&waypoint1=" + event['waypoint1'] + "&mode=fastest;car;traffic:disabled"

    r = requests.get(URL)

    return r.json()
