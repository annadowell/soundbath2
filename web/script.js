mapboxgl.accessToken = 'pk.eyJ1IjoiZG93ZWxsYWYiLCJhIjoiY2x0cjJjc2VqMGVtZzJrbnYwZjcxczdkcCJ9.ljRbHHEIuM4J40yUamM8zg';
const map = new mapboxgl.Map({
    container: 'map', // container ID
    style: 'mapbox://styles/dowellaf/cltr2h0h0007y01p7akad96el', // style URL
    center: [0, 0], // starting position
    zoom: 1 // starting zoom
});

let device;

async function setup() {
    const patchExportURL = "https://raw.githubusercontent.com/annadowell/soundbath/main/export/patch.export.json";

    // Create AudioContext
    const WAContext = window.AudioContext || window.webkitAudioContext;
    const context = new WAContext();

    // Create gain node and connect it to audio output
    const outputNode = context.createGain();
    outputNode.connect(context.destination);
    
    // Fetch the exported patcher
    let response, patcher;
    try {
        response = await fetch(patchExportURL);
        patcher = await response.json();
    
        if (!window.RNBO) {
            // Load RNBO script dynamically
            // Note that you can skip this by knowing the RNBO version of your patch
            // beforehand and just include it using a <script> tag
            await loadRNBOScript(patcher.desc.meta.rnboversion);
        }

    } catch (err) {
        const errorContext = {
            error: err
        };
        if (response && (response.status >= 300 || response.status < 200)) {
            errorContext.header = `Couldn't load patcher export bundle`,
            errorContext.description = `Check app.js to see what file it's trying to load. Currently it's` +
            ` trying to load "${patchExportURL}". If that doesn't` + 
            ` match the name of the file you exported from RNBO, modify` + 
            ` patchExportURL in app.js.`;
        }
        if (typeof guardrails === "function") {
            guardrails(errorContext);
        } else {
            throw err;
        }
        return;
    }
    
    // (Optional) Fetch the dependencies
    let dependencies = [];
    try {
        const dependenciesResponse = await fetch("https://raw.githubusercontent.com/annadowell/soundbath/main/export/dependencies.json");
        dependencies = await dependenciesResponse.json();

        // Prepend "export" to any file dependenciies
        dependencies = dependencies.map(d => d.file ? Object.assign({}, d, { file: "export/" + d.file }) : d);
    } catch (e) {}

    // Create the device
    let device;
    try {
        device = await RNBO.createDevice({ context, patcher });
    } catch (err) {
        if (typeof guardrails === "function") {
            guardrails({ error: err });
        } else {
            throw err;
        }
        return;
    }

    // (Optional) Load the samples
    if (dependencies.length)
        await device.loadDataBufferDependencies(dependencies);

    // Connect the device to the web audio graph
    device.node.connect(outputNode);

    // (Optional) Create a form to send messages to RNBO inputs
    makeInportForm(device);

    document.body.onclick = () => {
        context.resume();
    }

    // Skip if you're not using guardrails.js
    if (typeof guardrails === "function")
        guardrails();
}

function loadRNBOScript(version) {
    return new Promise((resolve, reject) => {
        if (/^\d+\.\d+\.\d+-dev$/.test(version)) {
            throw new Error("Patcher exported with a Debug Version!\nPlease specify the correct RNBO version to use in the code.");
        }
        const el = document.createElement("script");
        el.src = "https://c74-public.nyc3.digitaloceanspaces.com/rnbo/" + encodeURIComponent(version) + "/rnbo.min.js";
        el.onload = resolve;
        el.onerror = function(err) {
            console.log(err);
            reject(new Error("Failed to load rnbo.js v" + version));
        };
        document.body.append(el);
    });
}

function makeInportForm(device) {
    const idiv = document.getElementById("rnbo-inports");
    const inportSelect = document.getElementById("inport-select");
    const inportForm = document.getElementById("inport-form");
    let inportTag = null;
    
    // Device messages correspond to inlets/outlets or inports/outports
    // You can filter for one or the other using the "type" of the message
    const messages = device.messages;
    const inports = messages.filter(message => message.type === RNBO.MessagePortType.Inport);

    if (inports.length === 0) {
        idiv.removeChild(document.getElementById("inport-form"));
        return;
    } else {
        idiv.removeChild(document.getElementById("no-inports-label"));
        inports.forEach(inport => {
            const option = document.createElement("option");
            option.innerText = inport.tag;
            inportSelect.appendChild(option);
        });
        inportSelect.onchange = () => inportTag = inportSelect.value;
        inportTag = inportSelect.value;

        // Directly send the message without using form input
        const values = [0.4, 2, 5.4, 2, 6, 1, 5, 2, 5, 3, 1, 2]; // Your predefined message values

        // Send the message event to the RNBO device
        let messageEvent = new RNBO.MessageEvent(RNBO.TimeNow, inportTag, values);
        device.scheduleEvent(messageEvent);
    }
}

// async function main() {
//     try {
//         const context = new (window.AudioContext || window.webkitAudioContext)();
//         const outputNode = context.createGain();
//         outputNode.connect(context.destination);
//         outputNode.gain.setValueAtTime(0, context.currentTime);

//         const patcherUrl = "https://raw.githubusercontent.com/annadowell/soundbath/main/export/patch.export.json";
//         const patcherResponse = await fetch(patcherUrl);

//         if (!patcherResponse.ok) {
//             throw new Error(`Failed to fetch ${patcherUrl} (${patcherResponse.status} ${patcherResponse.statusText})`);
//         }

//         const patcher = await patcherResponse.json();
//         device = await RNBO.createDevice({ context, patcher });
//         device.node.connect(outputNode);

//         context.resume();
//     } catch (err) {
//         console.error("Error fetching or processing patcher:", err);
//         // Display error message to the user
//         const errDisplay = document.createElement("div");
//         errDisplay.style.color = "red";
//         errDisplay.innerHTML = `Encountered Error: <pre><code>${err.message}</pre></code>Check your console for more details.`;
//         document.body.appendChild(errDisplay);
//     }
// }

// window.addEventListener("load", main);

let geojsonData;

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
    
            // Ensure rainfall and country code are defined and rainfall is greater than 0.
            if (!isNaN(rainfall) && rainfall >= 0 && country_code !== undefined) {
                stationsWithRainfall++;
                totalRainfall += rainfall;
                rainfallAndCountryCodes += `${rainfall} ${country_code} `;
            }
        });
    
        rainfallAndCountryCodes = rainfallAndCountryCodes.trim(); // Trim the final string.
    
        let averageRainfall = (visibleFeatures.length > 0) ? (totalRainfall / visibleFeatures.length).toFixed(2) : 'N/A';
    
    
        // Send the message event to the RNBO device NOT WORKING
        // let messageEvent = new RNBO.MessageEvent(RNBO.TimeNow, rainfallAndCountryCodes);
        // device.scheduleEvent(messageEvent);

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
    fetch('https://raw.githubusercontent.com/muimran/soundbath/main/web/data/myData.geojson')
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
                'maxzoom': 9,
                'paint': {
                    'heatmap-weight': [
                        'interpolate',
                        ['linear'],
                        ['to-number', ['get', 'rainfall'], 0],
                        0,
                        0,
                        1,
                        1
                    ],
                    'heatmap-intensity': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        0,
                        1,
                        9,
                        3
                    ],
                    'heatmap-color': [
                        'interpolate',
                        ['linear'],
                        ['heatmap-density'],
                        0,
                        'rgba(33,102,172,0)',
                        0.2,
                        'rgba(172, 159, 219, 0.8)',
                        0.4,
                        'rgba(142, 120, 217, 0.8)',
                        0.6,
                        'rgba(116, 86, 218, 0.8)',
                        0.8,
                        'rgba(92, 56, 214, 0.8)',
                        1,
                        'rgba(48, 0, 208, 0.8)'
                    ],
                    'heatmap-radius': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        0,
                        2,
                        10,
                        30,
                        14,
                        80
                    ],
                    'heatmap-opacity': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        7,
                        1,
                        10,
                        1,
                        14,
                        0
                    ]
                }
            });

            // Define a circle layer to represent individual points of rainfall data visually.
            map.addLayer({
              'id': 'rainfall-point',
              'type': 'circle',
              'source': 'rainfall-data',
              'minzoom': 7,
              'paint': {
                  'circle-radius': [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      7,
                      ['interpolate', ['linear'], ['to-number', ['get', 'rainfall'], 0], 0, 1, 10, 10],
                      16,
                      ['interpolate', ['linear'], ['to-number', ['get', 'rainfall'], 0], 0, 5, 10, 50]
                  ],
                  'circle-color': [
                      'interpolate',
                      ['linear'],
                      ['to-number', ['get', 'rainfall'], 0],
                      0,
                      'rgba(33,102,172,0)',
                      .8,
                      'rgb(103,169,207)',
                      3,
                      'rgb(178,24,43)'
                  ],
                  'circle-stroke-color': 'white',
                  'circle-stroke-width': 1,
                  'circle-opacity': [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      8,
                      1,
                      22,
                      1
                  ]
              }
          });

            // Initialize and update the average rainfall calculation.
            updateAverageRainfall();
        });

    // Bind an event handler to update average rainfall whenever the map stops moving.
    map.on('moveend', updateAverageRainfall);
});

setup();