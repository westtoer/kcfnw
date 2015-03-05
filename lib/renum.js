/*jslint node: true*/

"use strict";
var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    rwcsv = require('./rwcsv.js'),
    geo = require('./geo-util.js');




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

function knoopAsString(knoop) {
    return util.format("'%s'{%s}[%s]<%s|%s>", knoop.code, knoop.id, knoop.status, knoop.oldnr, knoop.newnr);
}

Input.prototype.readKnoop = function (data) {
    rkLine += 1;

    // data members XCoord;YCoord;KNOOPID;VOLGNR;NETWERKID;CODE;STATUS;LON_X;LAT_Y
    var knoop = {
        toString: function () { return knoopAsString(knoop); },
        code: data.CODE,
        codeval: code2Value(data.CODE),
        status: data.STATUS,
        geo: {lat: data.LAT_Y, lon: data.LON_X},
        pos: {x: coordNum(data.XCoord), y: coordNum(data.YCoord)},
        netwerken: [data.NETWERKID],
        id: data.KNOOPID,
        oldnr: Number(data.VOLGNR),
        newnr: -1,
        targets: {}
    }, match;

    if (isEmptyCode(knoop.code)) {
        this.errKnoop(knoop, "no code for knoop");
        return; // no need to continue
    }

    if (this.knoopByCode.hasOwnProperty(knoop.code)) {
        match = this.knoopByCode[knoop.code];
        if (match.id !== knoop.id || match.oldnr !== knoop.oldnr || match.status !== knoop.status) {
            this.errKnoop(knoop,
                     util.format("matching knoop for code does not match " +
                                 "id (%d) oldnr (%d) or status [%s]", match.id, match.oldnr, match.status));
            return;
        }
        match.netwerken.push(knoop.netwerken[0]);
        knoop = match;
    } else {
        this.knoopByCode[knoop.code] = knoop;

        this.histKnoopStatus[knoop.status] = this.histKnoopStatus[knoop.status] || 0;
        this.histKnoopStatus[knoop.status] += 1;

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


function linkAsString(link) {
    return util.format("'%s'{%s}[%s]", link.code, link.pid, link.status);
}

Input.prototype.readLink = function (data) {
    rlLine += 1;

    // data members: XCoord;YCoord;NETWERKID;NETWERK;PID;STATUS;STARTCODE;ENDCODE
    var values, startCode, endCode,
        link = {
            toString: function () { return linkAsString(link); },
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

        this.histLinkStatus[link.status] = this.histLinkStatus[link.status] || 0;
        this.histLinkStatus[link.status] += 1;

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

    if ((link.start.status === 'DEL' || link.end.status === 'DEL') && link.status !== 'DEL') {
        this.errLink(link, "Links with grensknoop in status DEL, should itself be in status DEL");
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


function NewNumbers() {
    this.knoopDoneByCode = {};
    this.usage = {volgnr: {}, linknrs: {}};
    this.log = [];
}

NewNumbers.KEEP = "keep";
NewNumbers.MAKE = "make";
NewNumbers.UPDT = "update";
NewNumbers.ACTIONS = [NewNumbers.KEEP, NewNumbers.UPDT, NewNumbers.MAKE];

Input.prototype.reportCounts = function () {
    var me = this,
        maxCountTargets = -1;

    this.knoopForNumTargets = [];
    this.histKnoopTargets = {};
    this.knoopSet = {};
    this.histKnoopDeltaStatus = {};
    NewNumbers.ACTIONS.forEach(function (action) {
        me.knoopSet[action] = [];
        me.histKnoopDeltaStatus[action] = {};
    });

    function addToActionSet(action, knoop) {
        me.histKnoopDeltaStatus[action][knoop.status] = me.histKnoopDeltaStatus[action][knoop.status] || 0;
        me.histKnoopDeltaStatus[action][knoop.status] += 1;

        me.knoopSet[action].push(knoop);
    }

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
            addToActionSet(NewNumbers.MAKE, knoop);

        } else if (knoop.mustChange === true || knoop.status === 'IN') {
            addToActionSet(NewNumbers.UPDT, knoop);

        } else {
            addToActionSet(NewNumbers.KEEP, knoop);

        }
    });


    // run through the links
    // TODO compare all links not in 'DEL' to all those that hook up actual knoop in sets (keep, change, create)


    // dump hist counts
    console.log("Count knoop by Status: %j", this.histKnoopStatus);
    console.log("Count knoop by change, by status: %j", this.histKnoopDeltaStatus);
    console.log("Count link by Status: %j", this.histLinkStatus);
    console.log("Count knoop by Number of targets: %j", this.histKnoopTargets);
    console.log("Knoop(en) With most targets [=%d]", maxCountTargets);
    if (maxCountTargets > -1) {
        this.knoopForNumTargets[maxCountTargets].forEach(function (from) {
            console.log("\tFrom: '%s'{%d}[%s] :", from.code, from.id, from.status);
            Object.keys(from.targets).forEach(function (tocode) {
                var to = from.targets[tocode].target,
                    via = from.targets[tocode].link;
                console.log("\t\tTo: '%s'{%d}[%s] via link {%s}[%s]", to.code, to.id, to.status,
                           via.pid, via.status);
            });
        });
    }
    console.log("Count knoop by change: {");
    NewNumbers.ACTIONS.forEach(function (action) {
        console.log("\t'%s': %d", action, me.knoopSet[action].length);
    });
    console.log("}");
    
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

function Job(cmd) {
    this.linkbasePath = cmd.linkbase;
    this.knoopbasePath = cmd.knoopbase;
    this.outDirPath = cmd.output;
    this.cutoffcode = cmd.cutoff;
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

        return cb(data);
    });
};


NewNumbers.prototype.reportUsage = function (s) {
    var me = this, sum = 0, nr, cnt, nrset;
    s.write("Usage per volgnr\n");
    for (nr = 1; nr < 100; nr += 1) {
        nrset = me.usage.volgnr[nr];
        cnt = nrset ? nrset.length : 0;
        sum += cnt;
        s.write(util.format("%s<%d>,", nr, cnt));
    }
    s.write(util.format("\nsum=%d\n", sum));
};

NewNumbers.prototype.log = function (lvl, msg) {
    this.log.push({lvl: lvl, msg: msg});
};

NewNumbers.prototype.reportLog = function (s) {
    //TODO writeCSV to stream
};

NewNumbers.prototype.register = function (newnr, knoop) {
    newnr = Number(newnr);
    if (isNaN(newnr)) {
        throw util.format("cannot register knoop %s under undefined", knoop);
    }
    knoop.newnr = newnr;

    this.usage.volgnr[newnr] = this.usage.volgnr[newnr] || [];
    this.usage.volgnr[newnr].push(knoop);
};

NewNumbers.prototype.processKeepSet = function (knoopSet) {
    var me = this;
    console.log("first   get through the ones to {keep} #=%d", knoopSet.length);
    knoopSet.forEach(function (knoop) {

        if (knoop.status !== 'OUT') {
            if (knoop.status !== 'FIX') {
                throw util.format("unexpected status for a knoop that should be kept -- %s", knoop);
            } else {
                me.register(knoop.oldnr, knoop);
            }
        } else {
            // don't consider the ones out-scope, but do keep the newnr
            knoop.newnr = knoop.oldnr;
        }
    });

    this.reportUsage(process.stdout);
};

NewNumbers.prototype.processUpdtSet = function (knoopSet) {
    console.log("then    get through the ones to {updt} #=%d", knoopSet.length);
};

NewNumbers.prototype.processMakeSet = function (knoopSet) {
    console.log("finally get through the ones to {make} #=%d", knoopSet.length);
};

NewNumbers.prototype.process = function (action, knoopSet) {
    if (action === NewNumbers.KEEP) {
        this.processKeepSet(knoopSet);
    } else if (action === NewNumbers.UPDT) {
        this.processUpdtSet(knoopSet);
    } else if (action === NewNumbers.MAKE) {
        this.processMakeSet(knoopSet);
    }
};


function renumber(input) {
    var nn = new NewNumbers();
    //TODO calculate the suggested mindist between reused knopen.

    console.log("let us finally get started on all (=%d) these knopen", Object.keys(input.knoopByCode).length);
    NewNumbers.ACTIONS.forEach(function (action) {
        nn.process(action, input.knoopSet[action]);
    });
}


Job.prototype.execute = function () {
    console.log("Start Verwerking van %s", this);
    var self = this;
    this.prepare(function (input) {
        console.log("DONE preparation...");
        var result = renumber(input);
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
