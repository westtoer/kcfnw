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

function isEmptyCode(code) {
    return (code === null || code === undefined || String(code).trim().length === 0 || code === "#N/A");
}




var rkLine = 1,
    rlLine = 1;

function errKnoop(tpl, knoop, msg) {
    tpl.err.knp.push([rkLine, knoop.code, knoop.id, knoop.oldnr, knoop.status, msg]);
}

function coordNum(str) {
    return Number(str.replace(',', '.'));
}

function readKnoop(tpl, data) {
    rkLine += 1;

    //data members XCoord;YCoord;knoopid;volgnr;NETWERKID;NETWERK;code;STATUS;lon_x;lat_y
    var knoop = {
        code: data.code,
        codeval: code2Value(data.code),
        status: data.STATUS,
        geo: {lat: data.lat_y, lon: data.lon_x},
        pos: {x: coordNum(data.XCoord), y: coordNum(data.YCoord)},
        netwerken: [data.NETWERKID],
        id: data.knoopid,
        oldnr: Number(data.volgnr),
        newnr: -1,
        targets: {}
    }, match;

    if (isEmptyCode(knoop.code)) {
        errKnoop(tpl, knoop, "no code for knoop");
        return; // no need to continue
    }

    if (tpl.knoopByCode.hasOwnProperty(knoop.code)) {
        match = tpl.knoopByCode[knoop.code];
        if (match.id !== knoop.id || match.oldnr !== knoop.oldnr) {
            errKnoop(tpl, knoop,
                     util.format("matching knoop for code does not match id (%d) and oldnr (%d)", match.id, match.oldnr));
            return;
        }
        match.netwerken.push(knoop.netwerken[0]);
        knoop = match;
    } else {
        tpl.knoopByCode[knoop.code] = knoop;
    }

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

function errLink(tpl, link, msg) {
    var startcode = "#N/A", endcode = "#N/A";
    if (link.start) {startcode = link.start.code; }
    if (link.end) {endcode = link.end.code; }
    tpl.err.lnk.push([rlLine, link.code, link.pid, startcode, endcode, link.status, msg]);
}


function readLink(tpl, data) {
    rlLine += 1;

    // data members: XCoord;YCoord;NETWERKID;NETWERK;PID;STATUS;STARTCODE;ENDCODE
    var values, startCode, endCode,
        link = {
            code: "",
            pid: data.PID,
            status: data.STATUS,
            pos: {x: coordNum(data.XCoord), y: coordNum(data.YCoord)},
            netwerken: [data.NETWERKID]
        }, checkpid, match;

    if (isEmptyCode(data.STARTCODE) || isEmptyCode(data.ENDCODE)) {
        if (link.status !== 'NIV') {
            errLink(tpl, link, util.format("no start or end-code for knoop '%s' --> '%s'", data.STARTCODE, data.ENDCODE));
        }
        return; // no need to continue with this line
    }

    values = [code2Value(data.STARTCODE), code2Value(data.ENDCODE)].sort();
    startCode = value2Code(values[0]);
    endCode = value2Code(values[1]);

    if (startCode === endCode) {
        errLink(tpl, link, util.format("Invalid link: startcode == endcode '%s'.", startCode));
        return; // no need to continue with this line
    }

    if (!tpl.knoopByCode.hasOwnProperty(startCode)) {
        errLink(tpl, link, util.format("startcode '%s' doens't point to known knoop.", startCode));
        return; // no need to continue with this line
    }

    if (!tpl.knoopByCode.hasOwnProperty(endCode)) {
        errLink(tpl, link, util.format("endcode '%s' doens't point to known knoop.", startCode));
        return; // no need to continue with this line
    }

    link.code = startCode + "-" + endCode;

    // find the start and end-nodes by code
    link.start = tpl.knoopByCode[startCode];
    link.end = tpl.knoopByCode[endCode];

    // check if this code is already in use --> store if not, error if it is
    if (tpl.linkByCode.hasOwnProperty(link.code)) {
        match = tpl.linkByCode[link.code];
        if (match.pid !== link.pid || match.start !== link.start || match.end !== link.end) {
            errLink(tpl, link,
                     util.format("matching link for code does not match pid (%s) or start '%s' end '%s'", match.pid,
                                 match.start.code, match.end.code));
            return;
        }
        match.netwerken.push(link.netwerken[0]);
        link = match;
    } else {
        tpl.linkByCode[link.code] = link;
    }

    if (link.status !== 'NEW') {
        // check the knoopids to be matching
        checkpid = [link.start.id, link.end.id].sort().join("-");
        if (checkpid !== link.pid) {
            errLink(tpl, link, util.format("pid doesn't match the start-stop id's [%s]", checkpid));
        } else {
            // check if the centroide of the link is in between the start-end-knoop?
            if (!geo.isPosInside(link.pos, link.start.pos, link.end.pos)) {
                errLink(tpl, link, "link-centroid not between start-stop");
            }
        }
    }
    // link up the nodes --> add to the knoop.targets
    link.start.targets[link.end.code] = {link: link, target: link.end, direction: ">"};
    link.end.targets[link.start.code] = {link: link, target: link.start, direction: "<"};
}

function readInput(conf, cb) {
    var DELIM = ';',
        input = {
            cutoffcode: conf.cutoffcode,
            cutoffval: code2Value(conf.cutoffcode),
            maxCodeValue: 0,
            knoopByCode : {},
            linkByCode : {},
            err: {
                knp: [],
                lnk: [],
                all: []
            }
        };

    function errAll(msg) {
        input.err.all.push([msg]);
    }

    function reportMinNewMaxExist(input) {
        input.maxExistCode = value2Code(input.maxExistCodeVal);
        input.minNewCode = value2Code(input.minNewCodeVal);

        // check if all NEW codes are bigger then the non-NEW
        if (input.maxExistCodeVal > input.minNewCodeVal) {
            errAll(
                util.format(
                    "All new codes should come after existing codes! " +
                        "Biggest existing code '%s'(%d) >> smallest new code '%s'(%d)",
                    input.maxExistCode,
                    input.maxExistCodeVal,
                    input.minNewCode,
                    input.minNewCodeVal
                )
            );
        }
    }

    function reportGaps(input) {
        // check for gaps
        var val, code, startedGapAtVal = -1;
        console.log("--> check for gaps between 0 and %d", input.maxCodeValue);
        for (val = 0; val < input.maxCodeValue; val += 1) {
            code = value2Code(val);
            if (input.knoopByCode.hasOwnProperty(code)) { //code found
                if (startedGapAtVal !== -1) {
                    errAll(util.format("Gap in codes from '%s'(%d) to '%s'('%d') inclusive",
                                       value2Code(startedGapAtVal), startedGapAtVal,
                                       value2Code(val - 1), (val - 1)));
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
    }

    function reportDone() {

        reportMinNewMaxExist(input);
        reportGaps(input);
        //input.reportCalcs();

        console.log("knopen registered == " + Object.keys(input.knoopByCode).length);
        console.log("links  registered == " + Object.keys(input.linkByCode).length);

        rwcsv.write(path.join(conf.outDir, "err-knoop.csv"), input.err.knp, ["line", "code", "id", "volgnr", "status", "msg"]);
        rwcsv.write(path.join(conf.outDir, "err-link.csv"), input.err.lnk, ["line", "code", "pid", "startcode", "endcode", "status", "msg"]);
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
