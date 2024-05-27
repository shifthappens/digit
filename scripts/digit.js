/* Settings */
var MapoticMapID = 17890; //Mapotic Map ID to query over HTTP GET requests API
var minDistanceFromMarker = 10;   //Setting how close the user needs to be to a marker to trigger its action
var debugMode = true; //set debug mode on or off (disables logging)
var enableTestMarkers = true; //whether or not to place markers for testing purposes on the map
var enablePanZoomToUserLocation = false; //whether or not to pan and zoom automatically to user position (can be handy during testing)
var enableMarkersByDefault = true; //wheter or not to enable every Mapotic marker to be enabled by default (mark as found) useful during testing
var map_config_endpoint_url = "https://script.google.com/macros/s/AKfycbyQ0TC3RBinYz_95CPooTwlrV0cI4Sp7-jXvIi_o8a-h_fuWExA9fb_sEpn01GUlkkdWA/exec"; //for fetching the API key and map style ID from Jonathan

/* options object for geolocation positioning */
const geoLocationOptions = {
	enableHighAccuracy: true, // Get high accuracy reading, if available (default false)
	maximumAge: 2000, // Milliseconds for which it is acceptable to use cached position (default 0)
};

/* END OF SETTINGS -- DON'T EDIT THE CODE BELOW UNLESS YOU KNOW WHAT YOU'RE DOING */

/* Global variables and objects */

/* Map and marker variables */
var map; //holding the LeafletJS map object
var Markers = []; //create a collection for the markers
var MarkersFound = 0; //Counter for markers found

/* GeoLocation variables */
var geoLocationPermissionGranted = false; // for safari / iOS
var userPositionMarker; //Marker object for the user's position
var userPositionMarkerCircle; //Marker object for the location precision circle around the user's position
var userZoomed; //variable to keep track of whether the map has zoomed already once to the zoom level of the current position of the user
var userFocussed; //variable to keep track of whether the map has focussed already once to the boundaries of the current position of the user
var manualMarkersPlaced = false; //to check if manual markers have already been placed once
var allMarkersLoaded = false; //to check if all markers have been loaded from the database

/* DOM Elements and event bindings */
document.getElementById("panToLocation").onclick = panZoomToUserLocation; //element in top left corner to pan and zoom to current user location

var geoLocationPermissionButton = document.getElementById("enable-geolocation"); //Get the geolocation permission button
geoLocationPermissionButton.onclick = getGeoLocationPermission;

//"save game" check and set logic
var localStoragePermissionButton = document.getElementById("enable-localstorage"); //Get the "save game" permission button
if(hasLocalStoragePermission())
	setLocalStoragePermissionState("granted");
else
	localStoragePermissionButton.onclick = enableLocalStorage;

//game start button check logic
var gamewelcome = document.getElementById("gamewelcome"); // Get the welcome screen element
var startGameButton = document.getElementById("startgame"); // Get the <button> element that starts the game



/* END OF GLOBAL VARIABLES AND OBJECTS */

 // get map style config vars for maptiler
async function fetchMapTilerConfig() {
	const response = await fetch(map_config_endpoint_url);
	const mapConfig = await response.json();
	return mapConfig;
};

function enableLocalStorage()
{
	try
	{
		window.localStorage.setItem("digit_savegame", "yes");
		setLocalStoragePermissionState("granted");
	}
	catch(error)
	{
		console.log(error.name+":"+error.message);
		setLocalStoragePermissionState("denied");
	}
}

function hasLocalStoragePermission()
{
	if(window.localStorage.getItem("digit_savegame"))
		return true;
	else
		return false;
}

function checkGeoLocationPermissionStatus()
{
	navigator.permissions.query({ name: 'geolocation' }).then(permissionStatus => 
	{
		if (permissionStatus.state === 'granted') 
		{
			log("yep got location access");
			setGeoLocationPermissionState('granted');
			
			navigator.geolocation.getCurrentPosition(initGame, null, geoLocationOptions);
		}
		else if (permissionStatus.state === "prompt")
		{
			setGeoLocationPermissionState('prompt');
		}
		else if (permissionStatus.state === 'denied')
		{
			setGeoLocationPermissionState('denied');
		}
	});
}
    
  // When the user clicks on button, and the location is available, close the modal, start game
  document.addEventListener('DOMContentLoaded', async () => {
	startGameButton.innerHTML = "OK Got it, let me play!";
	startGameButton.disabled = false;

	startGameButton.onclick = function() 
	{
		log("trying to start game...");
		if(geoLocationPermissionGranted)
		{
			gamewelcome.style.display = "none";
		}
		else
		{
			alert("Cannot start game: permission to use location is denied. Please complete step 1.");
		}
	}
});

//check if user permissions have already been given, and set up game in background
//otherwise do nothing, wait for user.
checkGeoLocationPermissionStatus();


  //initiate the map
  map = L.map('map').setView([50.08457, 14.43277], 13);

  	//add map style
  fetchMapTilerConfig().then(mapConfig => {

	const mtLayer = L.maptilerLayer({
		apiKey: mapConfig.apiKey,
		style: mapConfig.style,
	  }).addTo(map);
	
  }).catch(error => {
	console.error('Error fetching map config: ', error);
  });
  
//custom Icons for the map
var userLocationIcon = L.icon({
	iconUrl: 'images/gps2.png',
	iconSize: [48, 48],
});

var gnomeIconNotFound = L.icon({
  iconUrl: 'images/gnomered.png',
  iconSize: [32, 32],
});

var gnomeIconFound = L.icon({
  iconUrl: 'images/gnomegreen.png',
  iconSize: [32, 32],
});

//get the data from Mapotic API with AJAX request
async function getMarkersFromMapotic()
{
	try {
		const response = await fetch(`https://www.mapotic.com/api/v1/maps/${MapoticMapID}/pois.geojson/`);
		const mapinfo = await response.json();

		log(mapinfo);

		for (const feature of mapinfo.features) {
			if (feature.properties.category_name.en === "Mural") {
				log(`adding item ${feature.properties.id} at ${feature.geometry.coordinates[0]}, ${feature.geometry.coordinates[1]}`);

				const lng = feature.geometry.coordinates[0];
				const lat = feature.geometry.coordinates[1];
				const marker = L.marker([lat, lng], { icon: gnomeIconNotFound }).addTo(map);
				marker.found = false;
				marker.markerID = feature.properties.id;

				// Fetch additional data about the marker
				const detailResponse = await fetch(`https://www.mapotic.com/api/v1/maps/${MapoticMapID}/public-pois/${marker.markerID}/`);
				const POIinfo = await detailResponse.json();

				// Construct the popup content from the Mapotic response
				const markerTitle = POIinfo.name;
				let markerDesc = "";
				for (const attribute of POIinfo.attributes_values) {
					if (attribute.attribute.name.en === "Description") {
						markerDesc = attribute.value_html;
						break;
					}
				}

				const markerImageURL = POIinfo.image.image.medium;
				marker.popupContent = `<strong>${markerTitle}</strong> <br /><img src='${markerImageURL}' style='width: 100%;' /><p>${markerDesc}</p>`;

				log(marker.popupContent);

				addMarkerToGame(marker);

				if (checkIfFound(marker)) enableMarker(marker);
				if (enableMarkersByDefault) enableMarker(marker);
			}
		}

		document.getElementById("totalitems").innerHTML = Markers.length;
		checkDistanceToMarkers(userPositionMarker);
		allMarkersLoaded = true;

	} catch (error) {
		console.error('Error fetching Mapotic data: ', error);
	}
}

/* Function to get location permission from user */
function getGeoLocationPermission(onSuccessCallback)
{
	log("trying to get permission for geolocation...");

	const customGeoLocationOptions = 
	{
		enableHighAccuracy: false, //we don't need a very detailed position, it's just to trigger the permission prompt
		maximumAge: Infinity
	}
	
	navigator.geolocation.getCurrentPosition(onLocationPermissionGranted, onError, customGeoLocationOptions);

	function onLocationPermissionGranted(pos)
	{

		setGeoLocationPermissionState('granted');
		initGame(pos);
		geoLocationPermissionGranted = true; // for safari / iOS
		
		if(onSuccessCallback instanceof Function)
			onSuccessCallback(true);
	}

	function onError(err)
	{
		log("there was an error getting permission for geolocation.");
		log(err);
		
		if (err.code === 1) {
			alert("You cannot run the game without geolocation access. Please try again.");
			setGeoLocationPermissionState('denied');
			// Runs if user refuses access
		} else {
			log("error code getting location: "+err.code);
			log(err);
			// Runs if there was a technical problem.
		}		  
	}
}

function watchUserPosition()
{
  navigator.geolocation.watchPosition(updateGame, error, geoLocationOptions);
  // Fires success function immediately and when user position changes

  function error(err) {
	log(err);
	  if (err.code === 1) 
	  {
		  alert("While watching your position, your permission changed. You cannot run the game without geolocation access. Please try again.");
		  gamewelcome.style.display = "block";
		  checkGeoLocationPermissionStatus();
	  } 
	  else 
	  {
		  log("error code getting location: "+err.code);
		  log(err);
		  // Runs if there was a technical problem.
	  }
  }
}

function initGame(pos)
{
	if(!pos)
	{
		log("No GeoLocation object provided, can't init game...");
		return false;
	}

	const lat = pos.coords.latitude;
	const lng = pos.coords.longitude;
	const accuracy = pos.coords.accuracy; // Accuracy in metres

	//add all the markers from the database, if not done already
	if(!allMarkersLoaded)
	{
	  getMarkersFromMapotic();
	}

	placeUpdateUserPositionMarker(pos);

	//check distance to markers
	checkDistanceToMarkers(userPositionMarker)
	
	//adding some Markers manually to be able to test this anywhere
	if(!manualMarkersPlaced && enableTestMarkers)
	{
	  addManualMarkersForTesting(lat, lng);
	  manualMarkersPlaced = true;
	}

	if(enablePanZoomToUserLocation)
	{
		panZoomToUserLocation();
		userZoomed = true;
		userFocussed = true;
	}

	watchUserPosition();
}

  function updateGame(pos) {
    log("Position of user changed, checking markers, updating...");   
	
	//update user position marker
	placeUpdateUserPositionMarker(pos);

	//check distance to markers
	checkDistanceToMarkers(userPositionMarker)
}

function placeUpdateUserPositionMarker(pos)
{
	const lat = pos.coords.latitude;
	const lng = pos.coords.longitude;
	const accuracy = pos.coords.accuracy; // Accuracy in metres

	// Removes any existing user position marker and circles, if set (new ones about to be set)
	if (userPositionMarker) 
	{
		map.removeLayer(userPositionMarker);
		map.removeLayer(userPositionMarkerCircle);
	}

	// Adds marker indicating user position to the map and a circle for accuracy
	userPositionMarker = L.marker([lat, lng], {icon: userLocationIcon}).addTo(map);
	userPositionMarkerCircle = L.circle([lat, lng], { radius: accuracy }).addTo(map);

}

  function checkDistanceToMarkers(userMarker)
  {
	log("userMarker: ");
	log(userMarker);
	log("Markers: ");
	log(Markers);

	Markers.forEach((marker, index) => {
	  var distanceFromUser = getUserDistanceFromMarker(marker);
	  log("distance from user: "+distanceFromUser+"m");
	  marker.setTooltipContent("You are not close enough to collect this item ("+distanceFromUser+"m)");

	  if(distanceFromUser <= minDistanceFromMarker && !marker.found)
	  {			   
		enableMarker(marker);
	  }
	});

  }

  function getUserDistanceFromMarker(marker)
  {
	 var userLatLng = userPositionMarker.getLatLng();
	 var markerLatLng = marker.getLatLng();
	 
	 return Math.floor(userLatLng.distanceTo(markerLatLng));
  }

  
function addManualMarkersForTesting(lat, lng)
{
	// Calculate the destination coordinates 8 meters east (90 degrees) of the current user's location
	var destinationCoordinates = calculateDestination(lat, lng, 8, 90);
	log("will place a random gnome 8m away at bearing 90 resulting in "+destinationCoordinates);

	// Add a marker at the destination coordinates  
	var marker = L.marker(destinationCoordinates, {icon: gnomeIconNotFound}).addTo(map);
	marker.markerID = 1;
	addMarkerToGame(marker);
	enableMarker(marker); //force at least one marker found (closest) so testing is easier...

	//add some Markers at random places
	for (var i = 0; i < 4; i++)
	{
		var meters = Math.floor(Math.random() * 150);
		var bearing = Math.floor(Math.random() * 360);
		var destinationCoordinates = calculateDestination(lat, lng, meters, bearing);
		log("will place a random gnome "+meters+"m away at bearing "+bearing+" resulting in "+destinationCoordinates);
		var marker = L.marker(destinationCoordinates, {icon: gnomeIconNotFound}).addTo(map);
		marker.markerID = i;
		addMarkerToGame(marker);
	}
}
	
  function panZoomToUserLocation()
  {
	userLatLng = userPositionMarker.getLatLng();
	map.setView([userLatLng.lat, userLatLng.lng]);
	// Set map focus to current user position
	
	map.fitBounds(userPositionMarkerCircle.getBounds());
	// Set zoom to boundaries of accuracy circle    
  }

  // Function to calculate destination coordinates
  function calculateDestination(lat, lon, distance, bearing) {
	  var R = 6378137; // Earth's radius in meters
	  var brng = bearing * (Math.PI / 180); // Convert bearing to radians
	  var lat1 = lat * (Math.PI / 180); // Convert current latitude to radians
	  var lon1 = lon * (Math.PI / 180); // Convert current longitude to radians
  
	  var lat2 = Math.asin(Math.sin(lat1) * Math.cos(distance / R) +
						   Math.cos(lat1) * Math.sin(distance / R) * Math.cos(brng));
	  var lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(distance / R) * Math.cos(lat1),
								   Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2));
  
	  lat2 = lat2 * (180 / Math.PI); // Convert back to degrees
	  lon2 = lon2 * (180 / Math.PI); // Convert back to degrees
  
	  return [lat2, lon2];
  }
  
  function addMarkerToGame(marker)
  {
	//add tooltip to indicate user not close enough by default...
	marker.bindTooltip("You are not close enough to collect this item ("+getUserDistanceFromMarker(marker)+"m)");

	//add marker to global markers array
	Markers.push(marker);
  }
  
  function enableMarker(marker)
  {
	if(marker.found == 1)
		return false; //marker already marked as found, no further action required

	marker.found = 1; //mark this item as found
	marker.setIcon(gnomeIconFound); //green icon

	var popupContent = marker.popupContent;
	marker.bindPopup(popupContent);
	marker.unbindTooltip();
	updateGameStats();
	saveMarker(marker);
  }

  function saveMarker(marker)
  {
	if(!hasLocalStoragePermission())
		return false; //we do not save the game

	//check existence of the array of found markers
	if(!window.localStorage.getItem("digit_markers_found"))
		window.localStorage.setItem("digit_markers_found", "[]");

	//get the found markers array
	foundmarkers = JSON.parse(window.localStorage.getItem("digit_markers_found"));

	//check if not already in array
	if(foundmarkers.includes(marker.markerID))
		return true; //nothing to save, already there

	//not found yet, append the new marker ID to the array
	foundmarkers.push(marker.markerID);

	//save it to local storage
	window.localStorage.setItem("digit_markers_found", JSON.stringify(foundmarkers));
  }

  function checkIfFound(marker)
  {
	if(!hasLocalStoragePermission())
		return false; //we do not have permission to save state

	//check existence of the array of found markers
	if(!window.localStorage.getItem("digit_markers_found"))
		window.localStorage.setItem("digit_markers_found", "[]");

	//get the found markers array
	foundmarkers = JSON.parse(window.localStorage.getItem("digit_markers_found"));

	//check if not already in array
	if(foundmarkers.includes(marker.markerID))
		return true; //found already
	else
		return false; //not found yet
  }
  
  function updateGameStats()
  {
	MarkersFound = MarkersFound + 1;
	document.getElementById("itemsfound").innerHTML = MarkersFound; //update counter  
  }

  function log(msg)
  {
	if(debugMode)
		console.log(msg);
  }

  function setGeoLocationPermissionState(id)
  {
	if(id == "granted")
	{
		geoLocationPermissionButton.innerHTML = '<i class="fa fa-check"></i> Geolocation access granted';
		//geoLocationPermissionButton.onclick = function() { log("ok removing event listener..."); }
		geoLocationPermissionGranted = true; // for safari / iOS
	}
	else if(id == "denied")
	{
		geoLocationPermissionButton.innerHTML = '<i class="fa fa-times-circle"></i> Geolocation access denied. Please manually enable in your browser settings and refresh page.';
		geoLocationPermissionGranted = false; // for safari / iOS
	}
	else if(id == "prompt")
	{
		geoLocationPermissionButton.innerHTML = 'Enable geolocation';
		geoLocationPermissionButton.onclick = getGeoLocationPermission;
		geoLocationPermissionGranted = false; // for safari / iOS
	}
  }

  function setLocalStoragePermissionState(id)
  {
	if(id == "granted")
	{
		localStoragePermissionButton.innerHTML = '<i class="fa fa-check"></i> Your game will be saved!';
	}
	else if(id == "prompt")
	{
		localStoragePermissionButton.innerHTML = 'Yes, save my game progress locally!';
	}
	else if(id == "denied")
	{
		geoLocationPermissionButton.innerHTML = '<i class="fa fa-times-circle"></i> Access to local storage denied. Perhaps you blocked it in settings?';
	}
  }