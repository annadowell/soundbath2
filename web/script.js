mapboxgl.accessToken = 'pk.eyJ1IjoiZG93ZWxsYWYiLCJhIjoiY2x0cjJjc2VqMGVtZzJrbnYwZjcxczdkcCJ9.ljRbHHEIuM4J40yUamM8zg';
const map = new mapboxgl.Map({
    container: 'map', // container ID
    style: 'mapbox://styles/dowellaf/cltr2h0h0007y01p7akad96el', // style URL
    center: [-70, -90], // starting position
    zoom: 0, // starting zoom
    interactive: false // Disable all map interactions initially
});

let isAtStart = true;
const start = {
    center: [-70, -90],
    zoom: 0,
    pitch: 0,
    bearing: 250
};
const end = {
    center: [-1.634654, 53.546552],
    zoom: 5,
    bearing: 0,
    pitch: 0
};


document.getElementById('start').addEventListener('click', () => {
    const target = isAtStart ? end : start;
    isAtStart = !isAtStart;

    // Fly to the new map position
    map.flyTo({
        ...target,
        duration: 6000,
        essential: true
    });

    // Attempt to resume the audio context to start playing music
    context.resume().then(() => {
        console.log('Playback resumed successfully');
    }).catch(err => {
        console.error('Playback failed to resume:', err);
    });

    // Hide the start button immediately after it is clicked
    document.getElementById('start').style.display = 'none';

    // Listen for when the map has finished flying to the new location
    map.once('moveend', () => {
        // Enable map interactions only after the fly to has completed
        map.boxZoom.enable();
        map.scrollZoom.enable();
        map.dragPan.enable();
        map.dragRotate.enable();
        map.keyboard.enable();
        map.doubleClickZoom.enable();
        map.touchZoomRotate.enable();
    });
});




let device;
const context = new (window.AudioContext || window.webkitAudioContext)();


async function main() {
    try {
        const outputNode = context.createGain();
        outputNode.connect(context.destination);
        //outputNode.gain.setValueAtTime(0, context.currentTime);

        // THIS IS THE RAW LINK TO THE PATCH
        const patcherUrl = "https://raw.githubusercontent.com/annadowell/soundbath2/main/export/patch.export.json";
        const patcherResponse = await fetch(patcherUrl);

        if (!patcherResponse.ok) {
            throw new Error(`Failed to fetch ${patcherUrl} (${patcherResponse.status} ${patcherResponse.statusText})`);
        }

        const patcher = await patcherResponse.json();
        device = await RNBO.createDevice({ context, patcher });
        device.node.connect(outputNode);

        //context.resume();
    } catch (err) {
        console.error("Error fetching or processing patcher:", err);
        // Display error message to the user
        const errDisplay = document.createElement("div");
        errDisplay.style.color = "red";
        errDisplay.innerHTML = `Encountered Error: <pre><code>${err.message}</pre></code>Check your console for more details.`;
        document.body.appendChild(errDisplay);
    }


    // One-liner to resume playback when user interacts with the page.
    // document.querySelector('#map').addEventListener('click', function() {
    //     context.resume().then(() => {
    //     console.log('Playback resumed successfully');
    //     });
    // });
}
window.addEventListener("load", main);


let geojsonData;


// log scale starts here
// function mapRainfallLogarithmically(rainfall) {
//     if (rainfall > 2) {
//         return 7;
//     } else if (rainfall >= 0.01) {
//         const logBase = Math.log(2) - Math.log(0.01); // This is the scale factor
//         const adjustedLog = Math.log(rainfall) - Math.log(0.01);
//         return 7 * (adjustedLog / logBase);
//     } else {
//         return 0; // Assuming values below 0.01 should be treated as 0
//     }
// }
// log scale ends here

function updateAverageRainfall() {
    if (!geojsonData || !device) return;

    let bounds = map.getBounds(); // Retrieve the current geographic boundaries of the visible map area.
    let visibleFeatures = geojsonData.features.filter(feature => {
        let [lng, lat] = feature.geometry.coordinates;
        return bounds.contains([lng, lat]);
    });

    let totalRainfall = 0;
    let stationsWithRainfall = 0;
    let rainfallAndCountryCodes = '';

    // Calculate total rainfall and count stations with rainfall.
    visibleFeatures.forEach(feature => {
        let rainfall = parseFloat(feature.properties.rainfall);
        let country_code = feature.properties.country_code;

        // Ensure country code is defined and rainfall is processed.
        if (!isNaN(rainfall) && country_code !== undefined) {
            stationsWithRainfall++;
            totalRainfall += rainfall;
            rainfallAndCountryCodes += `${rainfall} ${country_code} `;
        }
    });

    rainfallAndCountryCodes = rainfallAndCountryCodes.trim(); // Trim the final string.

    let averageRainfall = (visibleFeatures.length > 0) ? (totalRainfall / visibleFeatures.length).toFixed(2) : 'N/A';

    // Prepare the rainfall data as an array of floats, filtering out any NaN values.
    let rainfall = rainfallAndCountryCodes
        .split(/\s+/)
        .map(s => parseFloat(s))
        .filter(value => !isNaN(value));

    // Append the specific array `[0, 1, 0, 2, 0, 3]` to the rainfall data.
    rainfall.push(0, 1, 0, 2, 0, 3);

    // Send the message event to the RNBO device.
    let messageEvent = new RNBO.MessageEvent(RNBO.TimeNow, "Data", rainfall);
    device.scheduleEvent(messageEvent);

    console.log("Data sent to RNBO:", rainfall);
    
    // Log only the data that is currently being visualized.
    console.log("Currently visualized data:", visibleFeatures);
    
    // Update the HTML content.
    document.getElementById('info').innerHTML = 'Average Rainfall: ' + averageRainfall + ' mm<br>' +
                                                'Total Rainfall: ' + totalRainfall.toFixed(2) + ' mm<br>' +
                                                'Total Stations: ' + visibleFeatures.length + '<br>' +
                                                'Stations with Rainfall > 0mm: ' + stationsWithRainfall + '<br>' +
                                                'Visible Rainfall & Country Codes: ' + rainfallAndCountryCodes;
}








// Event handler for the 'load' event of the map.
map.on('load', () => {
    // Fetch GeoJSON data asynchronously from a URL.
    fetch("https://raw.githubusercontent.com/muimran/betatesting_soundbath/main/web/data/myData.geojson")
        .then(response => response.json()) // Parse the fetched data as JSON.
        .then(data => {
            geojsonData = data; // Store the parsed GeoJSON data.

            // Add a source of type 'geojson' containing the rainfall data to the map.
            map.addSource('rainfall-data', {
                'type': 'geojson',
                'data': geojsonData
            });

// Define a heatmap layer to visualize rainfall intensity.
            map.addLayer({
                'id': 'rainfall-heat',
                'type': 'heatmap',
                'source': 'rainfall-data',
                'maxzoom': 20,
                'paint': {
                    // 'heatmap-weight': {
                    //     property: 'rainfall',
                    //     type: 'exponential',
                    //     stops: [
                    //         [0,0],
                    //         [1,1]
                    //     ]
                    // },
                    'heatmap-weight': [
                        'interpolate',
                        ['linear'],
                        ['to-number', ['get', 'rainfall'], 0],
                        0,
                        0,
                        1,
                        1
                    ],
                    'heatmap-intensity': {
                        stops: [
                          [12, 1],
                          [15, 3]
                        ]
                    },
                    'heatmap-color': [
                        'interpolate',
                        ['linear'],
                        ['heatmap-density'],
                        0,
                        'rgba(33,102,172,0)',
                        0.1,
                        'rgba(142, 120, 217, 0.8)',
                        0.4,
                        'rgba(116, 86, 218, 0.8)',
                        0.6,
                        'rgba(92, 56, 214, 0.8)',
                        0.8,
                        'rgba(48, 0, 208, 0.8)'
                    ],
                    'heatmap-radius': {
                        stops: [
                          [1,1],
                          [5,20],
                          [7,45],
                          [9,85]
                        ]
                    },
                    'heatmap-opacity': {
                        default: 1,
                        stops: [
                          [12, 1],
                          [20,0]
                        ]
                      }
                }
            });

    // Define a circle layer to represent individual points of rainfall data visually.
            map.addLayer({
                'id': 'rainfall-point',
                'type': 'circle',
                'source': 'rainfall-data',
                'minzoom': 12,
                'paint': {
                    'circle-radius': {
                        property: 'rainfall',
                        type: 'exponential',
                        stops: [
                            [{ zoom: 12, value: 0.25 }, 5],
                            [{ zoom: 13, value: 0.5 }, 10],
                            [{ zoom: 14, value: 0.75 }, 15],
                            [{ zoom: 15, value: 1 }, 20]
                        ]
                    },
                    'circle-color': [
                        'interpolate',
                        ['linear'],
                        ['heatmap-density'],
                        0,
                        'rgba(33,102,172,0)',
                        0.2,
                        'rgba(142, 120, 217, 0.8)',
                        0.4,
                        'rgba(116, 86, 218, 0.8)',
                        0.7,
                        'rgba(92, 56, 214, 0.8)',
                        0.8,
                        'rgba(48, 0, 208, 0.8)'
                    ],
                    'circle-stroke-color': 'white',
                    'circle-stroke-width': 1,
                    'circle-opacity': {
                        stops: [
                            [14, 0],
                            [15, 1]
                        ]
                    }
                },
                'filter': [
                    'all',
                    ['>', ['to-number', ['get', 'rainfall'], 0], 0], // Filter out zero rainfall values
                    ['has', 'country_code'] // Include only features with a country code
                ]
            });

            // Initialize and update the average rainfall calculation.
            updateAverageRainfall();
        });

    // Bind an event handler to update average rainfall whenever the map stops moving.
    map.on('moveend', updateAverageRainfall);
});
