/*jslint node: true*/

"use strict";
var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    rwcsv = require('./rwcsv.js'),
    geo = require('./geo-util.js');


function Job(cmd) {
    this.linkbasePath = cmd.linkbase;
    this.knoopbasePath = cmd.knoopbase;
    this.outDirPath = cmd.output;
}

Job.prototype.execute = function () {
    console.log("Start Verwerking van %s", this);
    var self = this;

};

Job.prototype.toString = function () {
    return util.format("Workset:\n\tknopen = %s\n\tlinks = %s", this.knoopbasePath, this.linkbasePath);
};


function doWork(cmd) {
    var job = new Job(cmd);
    job.execute();
}

module.exports.doWork = doWork;
