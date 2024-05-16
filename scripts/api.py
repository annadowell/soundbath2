import requests
import csv
import json
from datetime import datetime

# Function to safely convert to float
def safe_float_convert(value, default=None):
    try:
        return float(value)
    except (ValueError, TypeError):
        return default

# Function to check if the coordinates match
def coords_match(feature, csv_row):
    lat, lon = map(float, [csv_row['lat'], csv_row['long']])
    return feature['geometry']['coordinates'] == [lon, lat]

# Function to fetch station data with coordinates for England
def fetch_station_data_eng():
    url = 'https://environment.data.gov.uk/flood-monitoring/id/stations?parameter=rainfall'
    response = requests.get(url)
    eng_station_data = {}
    if response.status_code == 200:
        data = response.json()
        for station in data['items']:
            if station.get('lat') is not None and station.get('long') is not None:
                eng_station_data[station.get('notation')] = {
                    'latitude': station.get('lat'),
                    'longitude': station.get('long')
                }
    return eng_station_data

# Function to fetch rainfall measurements for England
def get_rainfall_data_eng():
    eng_url = "http://environment.data.gov.uk/flood-monitoring/id/measures?parameter=rainfall"
    eng_response = requests.get(eng_url)
    if eng_response.status_code == 200:
        eng_data = eng_response.json()
        return eng_data['items']
    return []

# Function to fetch station data with coordinates for Scotland
def get_scotland_rainfall_data(base_url):
    # Fetch the list of stations
    stations_url = f"{base_url}/api/Stations"
    stations_response = requests.get(stations_url)
    scotland_rainfall_data = []
    if stations_response.status_code == 200:
        stations = json.loads(stations_response.content)

        # Fetch latest data for each station
        for station in stations:
            station_id = station.get("station_no")
            station_details_url = f"{base_url}/api/Stations/{station_id}"
            hourly_data_url = f"{base_url}/api/Hourly/{station_id}?all=true"

            try:
                # Get station details including latitude and longitude
                details_response = requests.get(station_details_url)
                if details_response.status_code == 200 and details_response.content:
                    details_data = json.loads(details_response.content)
                    latitude = float(details_data.get("station_latitude", "0.0"))  # Default to 0.0 if not found
                    longitude = float(details_data.get("station_longitude", "0.0"))

                     # Get latest rainfall data
                    hourly_response = requests.get(hourly_data_url)
                    if hourly_response.status_code == 200 and hourly_response.content:
                        hourly_data = json.loads(hourly_response.content)
                        if hourly_data:
                            # Get the last record for the latest timestamp
                            last_record = hourly_data[-1]
                            timestamp = last_record.get("Timestamp")
                            rainfall = float(last_record.get("Value", "0.0"))  # Convert to float, default to 0.0
                            adjusted_rainfall = rainfall / 4  # Divide the rainfall value by 4
                            if latitude is not None and longitude is not None and rainfall is not None:
                                scotland_rainfall_data.append({
                                    'station_id': station_id,
                                    'latitude': latitude,
                                    'longitude': longitude,
                                    'timestamp': timestamp,
                                    'rainfall': adjusted_rainfall  # Use the adjusted rainfall

                                })
                else:
                    print(f"Error fetching station details for {station_id}: HTTP {details_response.status_code}")
            except json.JSONDecodeError:
                print(f"Invalid JSON response for station {station_id}")
            except Exception as e:
                print(f"An error occurred: {e}")

    return scotland_rainfall_data


# Function to fetch station data with rainfall measurements for Wales
def get_wales_rainfall_data(api_key):
    url = 'https://api.naturalresources.wales/rivers-and-seas/v1/api/StationData'
    headers = {'Ocp-Apim-Subscription-Key': api_key}
    response = requests.get(url, headers=headers)
    wales_rainfall_data = []
    if response.status_code == 200:
        wales_data = response.json()
        for station in wales_data:
            if station['coordinates']['latitude'] is not None and station['coordinates']['longitude'] is not None:
                station_id = station['location']
                latitude = station['coordinates']['latitude']
                longitude = station['coordinates']['longitude']
                rainfall = None
                for parameter in station['parameters']:
                    if parameter['paramNameEN'] == 'Rainfall':
                        rainfall = parameter['latestValue']
                        break
                if rainfall is not None:
                    wales_rainfall_data.append({
                        'station_id': station_id,
                        'rainfall': rainfall,
                        'latitude': latitude,
                        'longitude': longitude
                    })
    return wales_rainfall_data

# Fetching and processing data for England, Scotland, and Wales
eng_station_coordinates = fetch_station_data_eng()
eng_rainfall_data = get_rainfall_data_eng()
base_url = "https://www2.sepa.org.uk/rainfall"
scotland_rainfall_data = get_scotland_rainfall_data(base_url)
wales_rainfall_data = get_wales_rainfall_data('413a14f470f64b70a010cfa3b4ed6a79')  # Replace with actual API key

# Combine the data using latitude and longitude as the key
combined_data = []

# Process and combine England data
for measurement in eng_rainfall_data:
    station_id = measurement.get('stationReference')
    rainfall = safe_float_convert(measurement.get('latestReading', {}).get('value'))
    coordinates = eng_station_coordinates.get(station_id, {'latitude': None, 'longitude': None})
    lat_long_key = (coordinates['latitude'], coordinates['longitude'])
    if coordinates['latitude'] is not None and coordinates['longitude'] is not None:
        combined_data.append([lat_long_key, rainfall, 'England'])

# Process and combine Scotland data
for station_data in scotland_rainfall_data:
    rainfall = safe_float_convert(station_data['rainfall'])
    latitude = station_data['latitude']
    longitude = station_data['longitude']
    lat_long_key = (latitude, longitude)
    if latitude is not None and longitude is not None:
        combined_data.append([lat_long_key, rainfall, 'Scotland'])

# Process and combine Wales data
for station_data in wales_rainfall_data:
    rainfall = safe_float_convert(station_data['rainfall'])
    latitude = station_data['latitude']
    longitude = station_data['longitude']
    lat_long_key = (latitude, longitude)
    if latitude is not None and longitude is not None:
        combined_data.append([lat_long_key, rainfall, 'Wales'])

# Update existing CSV with rainfall data
filename = "../web/data/coordinates_rainfall_data.csv"
with open(filename, mode='r', newline='', encoding='utf-8') as file:
    reader = csv.DictReader(file)
    existing_data = list(reader)

# Create a mapping of latitude and longitude to index in existing data
lat_long_to_index = {(float(row['lat']), float(row['long'])): index for index, row in enumerate(existing_data)}

for data_row in combined_data:
    lat_long_key = data_row[0]
    rainfall = data_row[1]
    if lat_long_key in lat_long_to_index and rainfall is not None:
        existing_data[lat_long_to_index[lat_long_key]]['rainfall_mm'] = rainfall
        print(f"Updated CSV: Lat {lat_long_key[0]}, Long {lat_long_key[1]}, Rainfall {rainfall}")

# Write the updated data back to the CSV
with open(filename, mode='w', newline='', encoding='utf-8') as file:
    writer = csv.DictWriter(file, fieldnames=reader.fieldnames)
    writer.writeheader()
    writer.writerows(existing_data)

# Update the GeoJSON data with rainfall data from the CSV
csv_file_path = '../web/data/coordinates_rainfall_data.csv'
# geojson_file_path = '../web/data/myData.geojson'

# Read the updated CSV data
with open(csv_file_path, newline='') as csvfile:
    reader = csv.DictReader(csvfile)
    csv_data = [row for row in reader]

# Create a new GeoJSON data structure
geojson_data = {
    "type": "FeatureCollection",
    "features": []
}

# Iterate through CSV data and populate GeoJSON
for csv_row in csv_data:
    feature = {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [float(csv_row['long']), float(csv_row['lat'])]
        },
        "properties": {
            "rainfall": csv_row['rainfall_mm'],
            "country_code": int(csv_row['country_code'])
        }
    }
    geojson_data["features"].append(feature)

# Save the GeoJSON data to a new file
geojson_file_path = '../web/data/myData.geojson'
with open(geojson_file_path, 'w') as new_geojson_file:
    json.dump(geojson_data, new_geojson_file, indent=4)

print(f"New GeoJSON file '{geojson_file_path}' created with data from the CSV.")
