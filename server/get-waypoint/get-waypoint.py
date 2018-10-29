import boto3
from botocore.vendored import requests
import json

def get_waypoint(event, context):

    #URL = "https://geocoder.api.here.com/6.2/geocode.json?postalCode=" + event['postalCode'] + "&country=United+States&app_id=%20SzQ6I7hVBKixDDZ1kQ89&app_code=%20m2l6yujtfr__ovqwf3ixJg&gen=9"
    URL = "https://geocoder.api.here.com/6.2/geocode.json?postalCode=32819&country=United+States&app_id=%20SzQ6I7hVBKixDDZ1kQ89&app_code=%20m2l6yujtfr__ovqwf3ixJg&gen=9"

    r = requests.get(url = URL)

    # extracting data in json format
    data = r.json()
    d = {}
    #d['waypoint0'] = str(data['Response']['View'][0]['Result'][0]['Location']['NavigationPosition'][0]['Latitude']) + ',' + str(data['Response']['View'][0]['Result'][0]['Location']['NavigationPosition'][0]['Longitude'])
    d['latitude'] = data['Response']['View'][0]['Result'][0]['Location']['NavigationPosition'][0]['Latitude']
    d['longitude'] = data['Response']['View'][0]['Result'][0]['Location']['NavigationPosition'][0]['Longitude']

    #print("%s"%d)
    return d