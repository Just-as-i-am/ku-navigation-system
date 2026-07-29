function calculateRouteDistance(routeCoordinates) {
  let totalDistance = 0;

  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    totalDistance += calculateDistance(
      routeCoordinates[i],
      routeCoordinates[i + 1]
    );
  }

  return totalDistance;
}