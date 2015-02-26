/*jslint node: true*/

"use strict";

var WKT_POINT_RE = /POINT\s*\(\s*(\d+\.\d+)\s+(\d+\.\d+)\s*\)/;

function splitGeoFromWKT(wkt) {
    var parts = WKT_POINT_RE.exec(wkt);
    if (!parts || parts.length < 3) {
        throw "Could not parse WKT " + wkt;
    } else {
        return {
            lat:  parts[1],
            lon:  parts[2]
        };
    }
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371, // Radius of the earth in km
        dLat = deg2rad(lat2 - lat1),  // deg2rad below
        dLon = deg2rad(lon2 - lon1),
        a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2),

        c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
        d = R * c; // Distance in km
    return d;
}

function getDistanceFromGeoInKm(geo1, geo2) {
    return getDistanceFromLatLonInKm(geo1.lat, geo1.lon, geo2.lat, geo2.lon);
}

module.exports.wktPoint2LatLon = splitGeoFromWKT;
module.exports.distFromGeoInKm = getDistanceFromGeoInKm;
