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
    this.cutoffcode = cmd.cutoff;
}

Job.prototype.execute = function () {
    console.log("Start Verwerking van %s", this);
    var self = this;
    this.prepare(function () {
        console.log("DONE");
    });
};


var CODEBASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function code2Value(code) {
    var d1, d2, v1, v2;
    d1 = code.slice(0, 1);
    d2 = code.slice(1);

    v1 = CODEBASE.indexOf(d1);
    v2 = CODEBASE.indexOf(d2);

    return v1 * CODEBASE.length + v2;
}
function value2Code(val) {
    var d1, d2, v1, v2;
    v1 = Math.floor(val / CODEBASE.length);
    v2 = val % CODEBASE.length;

    d1 = CODEBASE.slice(v1, v1 + 1);
    d2 = CODEBASE.slice(v2, v2 + 1);

    return d1 + d2;
}

var rkLine = 1,
    rlLine = 1;

function errKnoop(tpl, knoop, msg) {
    tpl.err.knp.push([rkLine, knoop.code, knoop.id, knoop.oldnr, knoop.status, msg]);
}

function readKnoop(tpl, data) {
    rkLine += 1;

    var knoop = {
        code: data.code,
        codeval: code2Value(data.code),
        status: data.STATUS,
        geo: {lat: data.lat_y, lon: data.lon_x},
        netwerkid: data.NETWERKID,
        id: data.knoopid,
        oldnr: Number(data.volgnr),
        newnr: -1
    };

    if (knoop.code === undefined || knoop.code === null || knoop.code.trim().length === 0) {
        errKnoop(tpl, knoop, "no code for knoop");
        return; // no need to continue
    }

    /*
    if (tpl.knoopByCode.hasOwnProperty(knoop.code)) {
        //TODO handle multiple network-registries for same knoop / code --> all other fields must match

    }
    */
    tpl.knoopByCode[knoop.code] = knoop;

    tpl.maxCodeValue = Math.max(tpl.maxCodeValue, knoop.codeval);

    if (!tpl.hasOwnProperty('minNewCodeVal')) {
        tpl.maxExistCodeVal = code2Value("AA");
        tpl.minNewCodeVal = code2Value("Z9");
    }

    if (knoop.status === "NEW") { // new
        tpl.minNewCodeVal = (tpl.minNewCodeVal <= knoop.codeval) ?
                tpl.minNewCodeVal  : knoop.codeval; // the smallest

        if (Number(knoop.id) !== 0 || knoop.oldnr !== 0) {
            errKnoop(tpl, knoop, "knoop in status NEW should have id and volgnr == 0");
        }
        if (knoop.codeval < tpl.cutoffval) {
            errKnoop(tpl, knoop, util.format("knoop in status NEW should have code beyond '%s'(%d)", tpl.cutoffcode, tpl.cutoffval));
        }
    } else { //existing
        tpl.maxExistCodeVal = (tpl.maxExistCodeVal >= knoop.codeval) ?
                tpl.maxExistCodeVal  : knoop.codeval; // the biggest

        if (Number(knoop.id) === 0 || knoop.oldnr === 0) {
            errKnoop(tpl, knoop, "knoop not in status NEW should not have id or volgnr == 0");
        }
        if (knoop.codeval > tpl.cutoffval) {
            errKnoop(tpl, knoop, util.format("knoop not in status NEW should have code before '%s'(%d)", tpl.cutoffcode, tpl.cutoffval));
        }
    }
}

function readLink(tpl, data) {
    rlLine += 1;

    var link = {
        pid: data.pid,
        status: data.STATUS
    };
}

function readInput(conf, cb) {
    var DELIM = ';',
        input = {
            cutoffcode: conf.cutoffcode,
            cutoffval: code2Value(conf.cutoffcode),
            maxCodeValue: 0,
            knoopByCode : {},
            err: {
                knp: [],
                lnk: [],
                all: []
            }
        };

    function errAll(msg) {
        input.err.all.push([msg]);
    }
    function reportDone() {
        input.maxExistCode = value2Code(input.maxExistCodeVal);
        input.minNewCode = value2Code(input.minNewCodeVal);

        (function () {
            // check if all NEW codes are bigger then the non-NEW
            if (input.maxExistCodeVal > input.minNewCodeVal) {
                errAll(
                    util.format(
                        "All new codes should come after existing codes! Biggest existing code '%s'(%d) >> smallest new code '%s'(%d)",
                        input.maxExistCode,
                        input.maxExistCodeVal,
                        input.minNewCode,
                        input.minNewCodeVal
                    )
                );
            }
        }());

        (function () {
            // check for gaps
            var val, code, startedGapAtVal = -1;
            console.log("--> check for gaps between 0 and %d", input.maxCodeValue);
            for (val = 0; val < input.maxCodeValue; val += 1) {
                code = value2Code(val);
                if (input.knoopByCode.hasOwnProperty(code)) { //code found
                    if (startedGapAtVal !== -1) {
                        errAll(util.format("Gap in codes from '%s'(%d) to '%s'('%d') inclusive", value2Code(startedGapAtVal),
                                           startedGapAtVal, value2Code(val - 1), (val - 1)));
                        startedGapAtVal = -1;
                    }
                } else { // code not found
                    console.log(code);
                    // startGap here, or continue the one that was started
                    startedGapAtVal = (startedGapAtVal === -1) ? val : startedGapAtVal;
                }
            }
            // NOTE: there couldn't be a gap at the end
            if (startedGapAtVal !== -1) {
                errAll("Now really, there shouldn't be a gap at the end!");
            }
        }());

        console.log("knopen registered == " + Object.keys(input.knoopByCode).length);

        rwcsv.write(path.join(conf.outDir, "err-knoop.csv"), input.err.knp, ["line", "code", "id", "volgnr", "status", "msg"]);
        rwcsv.write(path.join(conf.outDir, "err-link.csv"), input.err.lnk, ["pid", "startcode", "endcode", "status", "msg"]);
        rwcsv.write(path.join(conf.outDir, "err-all.csv"), input.err.all, ["msg"]);

        cb(input);
    }

    function readLinks() {
        rwcsv.read(conf.link, reportDone, function (linkdata) {
            readLink(input, linkdata);
        }, DELIM);
    }

    function readKnopen() {
        rwcsv.read(conf.knoop, readLinks, function (knoopdata) {
            readKnoop(input, knoopdata);
        }, DELIM);
    }

    readKnopen();
}

Job.prototype.prepare = function (cb) {
    var self = this;

    readInput({
        "knoop": this.knoopbasePath,
        "link": this.linkbasePath,
        "outDir": this.outDirPath,
        "cutoffcode": this.cutoffcode
    }, function (data, err) {
        if (err) {
            throw err;
        }
        self.topology = data.topology;
        self.removed = data.removed;
        return cb(true);
    });
};

Job.prototype.toString = function () {
    return util.format("Workset:\n\tknopen = %s\n\tlinks = %s\n\toutput to %s\n\tapplying cutoff '%s'", this.knoopbasePath, this.linkbasePath, this.outDirPath, this.cutoffcode);
};


function doWork(cmd) {
    var job = new Job(cmd);
    job.execute();
}

module.exports.doWork = doWork;
