/*jslint node: true */

"use strict";
var fs = require('fs'),
    util = require('util'),
    csv = require('csv');

function writeCSVFile(csvPath, data, fields) {
    console.log("csv write to %s", csvPath);

    var csvFile = fs.createWriteStream(csvPath, {
            flags: 'w',
            encoding: 'utf-8',
            mode: "0666"
        }),
        out,
        typeOfData = Object.prototype.toString.call(data);

    csvFile.on('error', function (err) {
        console.error(err);
    });

    if (typeOfData === '[object Object]') {
        out = csv.stringify({
            columns: fields,
            header: true
        });
        Object.keys(data).forEach(function (id) {
            out.write(data[id]);
        });
    } else if (typeOfData === '[object Array]') {
        out = csv.stringify();
        out.write(fields);
        data.forEach(function (ln) {
            out.write(ln);
        });
    } else {
        throw "Cannot write to CSV an object of type " + typeOfData;
    }
    out.pipe(csvFile);
    out.end();
}

function readCSVFile(path, done, handle, delim) {

    delim = delim || ',';

    fs.createReadStream(path, { encoding: "utf-8" })
        .on('error', function (err) {
            console.log("ERROR reading file %s : %s", path, err);
        })
        .on('end', function () {
            done();
        })
        .pipe(csv.parse({
            delimiter: delim,
            columns: true
        }))
        .pipe(csv.transform(
            function (data) {
                handle(data);
            },
            function (err, data) {
                if (err !== null && err !== undefined) {
                    console.error("ERROR processing line data %j in file %s : %s", data, path, err);
                }
            }
        ));
}

module.exports = function (opts) {
    return {
        read: readCSVFile,
        write: writeCSVFile
    };
};
module.exports.read = readCSVFile;
module.exports.write = writeCSVFile;
