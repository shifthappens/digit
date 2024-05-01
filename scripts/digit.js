  var noZoomElement = document.getElementById('score');
  noZoomElement.addEventListener('gesturestart', function(event) {
	  event.preventDefault();
  });
  
  //Get the geolocation permission button
  var geoLocationPermissionButton = document.getElementById("enable-geolocation");
  
  geoLocationPermissionButton.onclick = getUserPermissionForGeoLocation;

  //check if user permissions have already been given, and set up game in background
  //otherwise do nothing, wait for user.
  navigator.permissions.query({ name: 'geolocation' }).then(permissionStatus => 
  {
	if (permissionStatus.state === 'granted') 
	{
	  console.log("yep got location access");
	  geoLocationPermissionButton.innerHTML = '<i class="fa fa-check"></i> Geolocation access granted';
	  geoLocationPermissionButton.onclick = function() { console.log("ok removing event listener..."); }
	  getUserPermissionForGeoLocation();
	}
  });
  
  // Get the modal
  var gamewelcome = document.getElementById("gamewelcome");
  
  // Get the <button> element that closes the modal
  var startGameButton = document.getElementById("startgame");
  
  // When the user clicks on button, and the location is available, close the modal
  startGameButton.onclick = function() 
  {
	navigator.permissions.query({ name: 'geolocation' }).then(permissionStatus => 
	{
	  if (permissionStatus.state !== 'denied') 
	  {
		getUserPermissionForGeoLocation(); //this also kickstarts the game
		gamewelcome.style.display = "none";
	  }
	  else if(permissionStatus.state === 'denied') 
	  {
		alert("Cannot start game: permission to use location is denied.");  
	  }
	});
  }
  
  //initiate the map
  var map = L.map('map').setView([51.108978, 17.032669], 17);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
	  maxZoom: 19,
	  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  
  //change the style of the map
  L.tileLayer.provider('Thunderforest.Pioneer', {apikey: '8cc9511579274e1489a20d86798ad9fa'}).addTo(map);

  //create a collection for the markers
  var Gnomes = [];

  //Counter for gnomes found
  var gnomesFound = 0;
  
  //Setting how close the user needs to be to a marker to trigger its action
  var minDistanceFromMarker = 10;

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
  function getMarkersFromMapotic() {
	var req = new XMLHttpRequest();
	req.onreadystatechange = processResponse;
	req.open("GET", "https://www.mapotic.com/api/v1/maps/17890/pois.geojson/");
	req.send();

  function processResponse() {
	  if (req.readyState != 4) return; // State 4 is DONE

	  var mapinfo = JSON.parse(req.responseText);

	  mapinfo.features.forEach((feature, i) => {
		if(feature.properties.category_name.en == "Gnome")
		{
		  console.log("adding a gnome at "+feature.geometry.coordinates[0]+", "+feature.geometry.coordinates[1]);
		  var lng = feature.geometry.coordinates[0];
		  var lat = feature.geometry.coordinates[1];
		  var gnomeMarker = L.marker([lat, lng], {icon: gnomeIconNotFound}).addTo(map);
		  addMarkerToGame(gnomeMarker);
		}
	  });
	
	  document.getElementById("totalitems").innerHTML = Gnomes.length;
	  checkDistanceToMarkers(userPositionMarker);
	}
  }

  //Now let's get the user's location and plot that continuously on the map
  //variables to fill in later
  var userPositionMarker; //Marker object for the user's position
  var userPositionMarkerCircle; //Marker object for the location precision circle around the user's position
  var userZoomed; //variable to keep track of whether the map has zoomed already once to the zoom level of the current position of the user
  var userFocussed; //variable to keep track of whether the map has focussed already once to the boundaries of the current position of the user
  var manualMarkersPlaced = false; //to check if manual markers have already been placed once
  var allMarkersLoaded = false; //to check if all markers have been loaded from the database
  
  const options = {
	  enableHighAccuracy: true,
	  // Get high accuracy reading, if available (default false)
	  maximumAge: 2000,
	  // Milliseconds for which it is acceptable to use cached position (default 0)
  };

function getUserPermissionForGeoLocation()
{
  navigator.geolocation.watchPosition(startRunGame, error, options);
  // Fires success function immediately and when user position changes

  function error(err) {

	  if (err.code === 1) {
		  alert("You cannot run the game without geolocation access. Please try again.");
		  geoLocationPermissionButton.innerHTML = '<i class="fa fa-times-circle"></i> Geolocation access denied. Please manually enable in your browser settings and refresh page.';
		  // Runs if user refuses access
	  } else {
		  console.log("error code getting location: "+err.code);
		  console.log(err);
		  // Runs if there was a technical problem.
	  }
  }
}

  function startRunGame(pos) {
  console.log("success getting the user location!");
  geoLocationPermissionButton.innerHTML = '<i class="fa fa-check"></i> Geolocation access granted';
   
	const lat = pos.coords.latitude;
	const lng = pos.coords.longitude;
	const accuracy = pos.coords.accuracy; // Accuracy in metres

	if (userPositionMarker) {
		map.removeLayer(userPositionMarker);
		map.removeLayer(userPositionMarkerCircle);
	}
	// Removes any existing marker and circles (new ones about to be set)

	userPositionMarker = L.marker([lat, lng], {icon: userLocationIcon}).addTo(map);
	userPositionMarkerCircle = L.circle([lat, lng], { radius: accuracy }).addTo(map);
	// Adds marker to the map and a circle for accuracy

	if (!userZoomed || !userFocussed) {
		panZoomToUserLocation();
		userZoomed = true;
		userFocussed = true;
	}

	//now that we have the current position of the user, continue the game
	//add all the markers from the database, if not done already
	if(!allMarkersLoaded)
	{
	  getMarkersFromMapotic();
	  allMarkersLoaded = true;
	}
	
	//check distance to markers
	checkDistanceToMarkers(userPositionMarker)
	
	//adding some gnomes manually to be able to test this anywhere
	if(!manualMarkersPlaced)
	{
	  addManualMarkersForTesting(lat, lng);
	  manualMarkersPlaced = true;
	}
}


  function checkDistanceToMarkers(userMarker)
  {
	console.log("userMarker: ");
	console.log(userMarker);
	console.log("Gnomes: ");
	console.log(Gnomes);

	Gnomes.forEach((gnome, index) => {
	  var distanceFromUser = getUserDistanceFromMarker(gnome);
	  console.log("distance from user: "+distanceFromUser+"m");
	  gnome.setTooltipContent("You are not close enough to collect this item ("+distanceFromUser+"m)");

	  if(distanceFromUser <= minDistanceFromMarker && !gnome.found)
	  {
	   // updateGameStats();
			   
		enableMarker(gnome);
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
	console.log("will place a random gnome 8m away at bearing 90 resulting in "+destinationCoordinates);
  
	// Add a gnome marker at the destination coordinates  
	var gnomeMarker = L.marker(destinationCoordinates, {icon: gnomeIconNotFound}).addTo(map);
	addMarkerToGame(gnomeMarker);
	enableMarker(gnomeMarker); //force at least one marker found (closest) so testing is easier...
	
	//add some Gnomes at random places
	for (var i = 0; i < 4; i++)
	{
		var meters = Math.floor(Math.random() * 150);
		var bearing = Math.floor(Math.random() * 360);
		var destinationCoordinates = calculateDestination(lat, lng, meters, bearing);
		console.log("will place a random gnome "+meters+"m away at bearing "+bearing+" resulting in "+destinationCoordinates);
		var gnomeMarker = L.marker(destinationCoordinates, {icon: gnomeIconNotFound}).addTo(map);
		addMarkerToGame(gnomeMarker);
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
  document.getElementById("panToLocation").onclick = panZoomToUserLocation;

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
	marker.markerID = Gnomes.length + 1;
	//add tooltip to indicate user not close enough by default...
	marker.bindTooltip("You are not close enough to collect this item ("+getUserDistanceFromMarker(marker)+"m)");
	Gnomes.push(marker);
  }
  
  function enableMarker(marker)
  {
	marker.found = 1; //mark this gnome as found
	marker.setIcon(gnomeIconFound); //green icon
	
	var popupContent = '<h4>This would contain the content of marker '+(marker.markerID)+'...</h4><iframe width="300" height="300" src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=M7nPi4kHAJD7aQVC" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
	marker.bindPopup(popupContent);
	marker.unbindTooltip();
	updateGameStats();
  }
  
  function updateGameStats()
  {
	gnomesFound = gnomesFound + 1;
	document.getElementById("itemsfound").innerHTML = gnomesFound; //update counter  
  }