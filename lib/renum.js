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

function Input(conf) {
    this.cutoffcode = conf.cutoffcode;
    this.cutoffval = code2Value(conf.cutoffcode);
    this.maxCodeValue = 0;
    this.knoopByCode = {};
    this.linkByCode = {};
    this.err = {
        knp: [],
        lnk: [],
        all: []
    };
    this.histKnoopStatus = {};
    this.histLinkStatus = {};
}

Input.prototype.errKnoop = function (knoop, msg) {
    this.err.knp.push([rkLine, knoop.code, knoop.id, knoop.oldnr, knoop.status, msg]);
};

Input.prototype.errLink = function (link, msg) {
    var startcode = "#N/A", endcode = "#N/A";
    if (link.start) {startcode = link.start.code; }
    if (link.end) {endcode = link.end.code; }
    this.err.lnk.push([rlLine, link.code, link.pid, startcode, endcode, link.status, msg]);
};

Input.prototype.errAll = function (msg) {
    this.err.all.push([msg]);
};

function coordNum(str) {
    return Number(str.replace(',', '.'));
}

Input.prototype.readKnoop = function (data) {
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


    this.histKnoopStatus[knoop.status] = this.histKnoopStatus[knoop.status] || 0;
    this.histKnoopStatus[knoop.status] += 1;

    if (isEmptyCode(knoop.code)) {
        this.errKnoop(knoop, "no code for knoop");
        return; // no need to continue
    }

    if (this.knoopByCode.hasOwnProperty(knoop.code)) {
        match = this.knoopByCode[knoop.code];
        if (match.id !== knoop.id || match.oldnr !== knoop.oldnr) {
            this.errKnoop(knoop,
                     util.format("matching knoop for code does not match id (%d) and oldnr (%d)", match.id, match.oldnr));
            return;
        }
        match.netwerken.push(knoop.netwerken[0]);
        knoop = match;
    } else {
        this.knoopByCode[knoop.code] = knoop;
    }

    this.maxCodeValue = Math.max(this.maxCodeValue, knoop.codeval);

    if (!this.hasOwnProperty('minNewCodeVal')) {
        this.maxExistCodeVal = code2Value("AA");
        this.minNewCodeVal = code2Value("Z9");
    }

    if (knoop.status === "NEW") { // new
        this.minNewCodeVal = (this.minNewCodeVal <= knoop.codeval) ?
                this.minNewCodeVal  : knoop.codeval; // the smallest

        if (Number(knoop.id) !== 0 || knoop.oldnr !== 0) {
            this.errKnoop(knoop, "knoop in status NEW should have id and volgnr == 0");
        }
        if (knoop.codeval < this.cutoffval) {
            this.errKnoop(knoop,
                          util.format("knoop in status NEW should have code beyond '%s'(%d)",
                                      this.cutoffcode, this.cutoffval));
        }
    } else { //existing
        this.maxExistCodeVal = (this.maxExistCodeVal >= knoop.codeval) ?
                this.maxExistCodeVal  : knoop.codeval; // the biggest

        if (Number(knoop.id) === 0 || knoop.oldnr === 0) {
            this.errKnoop(knoop, "knoop not in status NEW should not have id or volgnr == 0");
        }
        if (knoop.codeval > this.cutoffval) {
            this.errKnoop(knoop,
                          util.format("knoop not in status NEW should have code before '%s'(%d)",
                                      this.cutoffcode, this.cutoffval));
        }
    }
};

Input.prototype.readLink = function (data) {
    rlLine += 1;

    // data members: XCoord;YCoord;NETWERKID;NETWERK;PID;STATUS;STARTCODE;ENDCODE
    var values, startCode, endCode,
        link = {
            code: "",
            pid: data.PID,
            status: data.STATUS,
            pos: {x: coordNum(data.XCoord), y: coordNum(data.YCoord)},
            netwerken: [data.NETWERKID]
        }, checkpid, NOMATCH = {}, match = NOMATCH;

    if (isEmptyCode(data.STARTCODE) || isEmptyCode(data.ENDCODE)) {
        if (link.status !== 'NIV') {
            this.errLink(link, util.format("no start or end-code for link '%s' --> '%s'",
                                           data.STARTCODE, data.ENDCODE));
        }
        return; // no need to continue with this line
    }

    values = [code2Value(data.STARTCODE), code2Value(data.ENDCODE)].sort();
    startCode = value2Code(values[0]);
    endCode = value2Code(values[1]);

    this.histLinkStatus[link.status] = this.histLinkStatus[link.status] || 0;
    this.histLinkStatus[link.status] += 1;

    if (startCode === endCode) {
        this.errLink(link, util.format("Invalid link: startcode == endcode '%s'.", startCode));
        return; // no need to continue with this line
    }

    if (!this.knoopByCode.hasOwnProperty(startCode)) {
        this.errLink(link, util.format("startcode '%s' doens't point to known knoop.", startCode));
        return; // no need to continue with this line
    }

    if (!this.knoopByCode.hasOwnProperty(endCode)) {
        this.errLink(link, util.format("endcode '%s' doens't point to known knoop.", endCode));
        return; // no need to continue with this line
    }

    if (link.status === 'NIV') {
        this.errLink(link, "Skip link in state 'NIV'");
        return; // not to consider NIV links
    }

    link.code = startCode + "-" + endCode;

    // find the start and end-nodes by code
    link.start = this.knoopByCode[startCode];
    link.end = this.knoopByCode[endCode];

    // check if this code is already in use --> store if not, error if it is
    if (this.linkByCode.hasOwnProperty(link.code)) {
        match = this.linkByCode[link.code];
        if (match.pid !== link.pid || match.start !== link.start || match.end !== link.end) {
            this.errLink(link, util.format("matching link for code does not match pid (%s) " +
                                           "or start '%s' end '%s'", match.pid,
                                           match.start.code, match.end.code));
            return;
        }
        match.netwerken.push(link.netwerken[0]);
        link = match;
    } else {
        this.linkByCode[link.code] = link;
    }

    if (link.status !== 'NEW') {
        // check the knoopids to be matching
        checkpid = [link.start.id, link.end.id].sort().join("-");
        if (checkpid !== link.pid) {
            this.errLink(link,
                         util.format("pid {%s} doesn't match the start-stop id's {%s} for " +
                                     "link from '%s'{%d} to '%s'{%d}", link.pid, checkpid,
                                     link.start.code, link.start.id, link.end.code, link.end.id));
        } else {
            // check if the centroide of the link is in between the start-end-knoop?
            if (!geo.isPosInside(link.pos, link.start.pos, link.end.pos)) {
                this.errLink(link, "link-centroid not between start-stop");
            }
        }

        if (link.start.status === 'NEW' || link.end.status === 'NEW') {
            this.errLink(link, util.format("Link should be new if one of its endpoints is new"));
        }
    } else {
        //there should be no pid!
        if (!isEmptyCode(link.pid)) {
            this.errLink(link, "new links should not have a pid");
        }
    }

    // label the knoop as "mustChange"  if the link.status = DEL or NEW
    if (link.status === 'DEL' || link.status === 'NEW') {
        link.start.mustChange = true;
        link.end.mustChange = true;
    }

    if (link.status !== 'DEL' && match === NOMATCH) {
        // link up the nodes if they don't duplicate existing targets
        // (which should not be the case - but hey!)
        if (link.start.targets.hasOwnProperty(link.end.code)) {
            this.errLink(link, util.format("Link Error. Start at '%s' already has link to target '%s'",
                                           link.start.code, link.end.code));
        } else if (link.end.targets.hasOwnProperty(link.start.code)) {
            this.errLink(link, util.format("Link Error. End at '%s' already has link from target '%s'",
                                           link.end.code, link.start.code));
        } else {
            // link up the nodes --> add to the knoop.targets
            link.start.targets[link.end.code] = {link: link, target: link.end, direction: ">"};
            link.end.targets[link.start.code] = {link: link, target: link.start, direction: "<"};

        }
    }
};

Input.prototype.reportMinNewMaxExist = function () {
    this.maxExistCode = value2Code(this.maxExistCodeVal);
    this.minNewCode = value2Code(this.minNewCodeVal);

    // check if all NEW codes are bigger then the non-NEW
    if (this.maxExistCodeVal > this.minNewCodeVal) {
        this.errAll(
            util.format(
                "All new codes should come after existing codes! " +
                    "Biggest existing code '%s'(%d) >> smallest new code '%s'(%d)",
                this.maxExistCode,
                this.maxExistCodeVal,
                this.minNewCode,
                this.minNewCodeVal
            )
        );
    }
};

Input.prototype.reportGaps = function (input) {
    // check for gaps
    var val, code, startedGapAtVal = -1;
    console.log("--> check for gaps between 0 and %d", this.maxCodeValue);
    for (val = 0; val < this.maxCodeValue; val += 1) {
        code = value2Code(val);
        if (this.knoopByCode.hasOwnProperty(code)) { //code found
            if (startedGapAtVal !== -1) {
                this.errAll(util.format("Gap in codes from '%s'(%d) to '%s'('%d') inclusive",
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
        this.errAll("Now really, there shouldn't be a gap at the end!");
    }
};

Input.prototype.writeErrCSV = function (outDir) {
    rwcsv.write(path.join(outDir, "err-knoop.csv"), this.err.knp,
                ["line", "code", "id", "volgnr", "status", "msg"]);
    rwcsv.write(path.join(outDir, "err-link.csv"), this.err.lnk,
                ["line", "code", "pid", "startcode", "endcode", "status", "msg"]);
    rwcsv.write(path.join(outDir, "err-all.csv"), this.err.all, ["msg"]);
};

Input.prototype.reportCounts = function () {
    var me = this,
        maxCountTargets = 0;

    this.knoopForNumTargets = [];
    this.histKnoopTargets = {};
    this.newKnoop = [];
    this.changingKnoop = [];
    this.keepKnoop = [];
    this.keepKnoopByVolgnr = {};

    // run through the knopen
    Object.keys(this.knoopByCode).forEach(function (code) {
        var knoop = me.knoopByCode[code],
            countTargets = Object.keys(knoop.targets).length;

        maxCountTargets = Math.max(maxCountTargets, countTargets);

        if (countTargets < 3 && knoop.status !== 'DEL') {
            me.errKnoop(knoop, util.format("knoop has not enough targets (=%d) ", countTargets));
        }

        me.knoopForNumTargets[countTargets] = me.knoopForNumTargets[countTargets] || [];
        me.knoopForNumTargets[countTargets].push(knoop);

        me.histKnoopTargets[countTargets] = me.histKnoopTargets[countTargets] || 0;
        me.histKnoopTargets[countTargets] += 1;

        if (knoop.status === 'NEW') {
            me.newKnoop.push(code);
        } else if (knoop.mustChange === true) {
            me.changingKnoop.push(code);

        } else {
            me.keepKnoop.push(code);
            me.keepKnoopByVolgnr[knoop.oldnr] = me.keepKnoopByVolgnr[knoop.oldnr] || [];
            me.keepKnoopByVolgnr[knoop.oldnr].push(knoop);

        }
    });


    // run through the links


    // dump chist counts
    console.log("Count knoop by Status: %j", this.histKnoopStatus);
    console.log("Count link by Status: %j", this.histLinkStatus);
    console.log("Count knoop by Number of targets: %j", this.histKnoopTargets);
    console.log("Knoop(en) With most targets [=%d]", maxCountTargets);
    this.knoopForNumTargets[maxCountTargets].forEach(function (from) {
        console.log("\tFrom: '%s'{%d}[%s] :", from.code, from.id, from.status);
        Object.keys(from.targets).forEach(function (tocode) {
            var to = from.targets[tocode].target,
                via = from.targets[tocode].link;
            console.log("\t\tTo: '%s'{%d}[%s] via link {%s}[%s]", to.code, to.id, to.status,
                       via.pid, via.status);
        });
    });
    console.log("");
    console.log("Count knoop by change: {'keep': %d, 'change': %d, 'new': %d}",
                this.keepKnoop.length, this.changingKnoop.length, this.newKnoop.length);
};

function readInput(conf, cb) {
    var DELIM = ';',
        input = new Input(conf);

    function reportDone() {
        rkLine = rlLine = NaN;
        input.reportMinNewMaxExist();
        input.reportGaps();
        input.reportCounts();

        console.log("knopen registered == " + Object.keys(input.knoopByCode).length);
        console.log("links  registered == " + Object.keys(input.linkByCode).length);

        input.writeErrCSV(conf.outDir);

        cb(input);
    }

    function readLinks() {
        rwcsv.read(conf.link, reportDone, function (linkdata) {
            input.readLink(linkdata);
        }, DELIM);
    }

    function readKnopen() {
        rwcsv.read(conf.knoop, readLinks, function (knoopdata) {
            input.readKnoop(knoopdata);
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
