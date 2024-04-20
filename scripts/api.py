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
            station_data_url = f"{base_url}/api/Stations/{station_id}"
            try:
                response = requests.get(station_data_url)
                if response.status_code == 200 and response.content:
                    data = json.loads(response.content)
                    # Convert data types
                    latitude = float(data.get("station_latitude"))
                    longitude = float(data.get("station_longitude"))
                    rainfall = float(data.get("itemValue")) / 4  # Dividing rainfall value by 4
                    station_id = int(station_id)  # Convert station_id to integer

                    if latitude is not None and longitude is not None and rainfall is not None:
                        scotland_rainfall_data.append({
                            'station_id': station_id,
                            'latitude': latitude,
                            'longitude': longitude,
                            'rainfall': rainfall
                        })
                else:
                    print(f"Error fetching data for station {station_id}: HTTP {response.status_code}")
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
geojson_file_path = '../web/data/myData.geojson'

# Read the updated CSV data
with open(csv_file_path, newline='') as csvfile:
    reader = csv.DictReader(csvfile)
    csv_data = [row for row in reader]

# Load the GeoJSON data
with open(geojson_file_path) as geojson_file:
    geojson_data = json.load(geojson_file)

update_count = 0
for csv_row in csv_data:
    for index, feature in enumerate(geojson_data['features']):
        if coords_match(feature, csv_row):
            feature['properties']['rainfall'] = csv_row['rainfall_mm']
            update_count += 1
            print(f"Updated GeoJSON Feature at Index {index} with Rainfall {csv_row['rainfall_mm']}")
            break  # Stop looking once we've found the matching feature

# Save the updated GeoJSON data
with open(geojson_file_path, 'w') as geojson_file:
    json.dump(geojson_data, geojson_file, indent=4)

# Final print statement
current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
print(f"Data has been updated in both {csv_file_path} and {geojson_file_path}. Current time is {current_time}")
