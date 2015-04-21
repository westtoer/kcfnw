/*jslint node: true*/

"use strict";
var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    rwcsv = require('./rwcsv.js'),
    geo = require('./geo-util.js');


function isEmpty(obj) {
    return (obj === null || obj === undefined || (obj.hasOwnProperty('length') && obj.length === 0));
}

function contains(container, item) {
    return (container.indexOf(item) !== -1);
}

function containsAll(container, items) {
    var allIn = true;
    items.forEach(function (item) {
        allIn = allIn && contains(container, item);
    });

    return allIn;
}

function isEmptyCode(code) {
    return (code === null || code === undefined || String(code).trim().length === 0 || code === "#N/A");
}

var CODEBASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function code2Value(code) {
    var d, v, i, val = 0;

    if (isEmpty(code)) {
        throw util.format("code '%s' is empty", code);
    }

    // read digits by position
    for (i = 0; i < code.length; i += 1) {
        d = code.slice(i, i + 1);
        v = CODEBASE.indexOf(d);
        if (v === -1) {
            throw util.format("code '%s' contains invalid character at position %d, <%s>", code, i, d);
        }
        val = val * CODEBASE.length + v;
    }

    return val;
}
function value2Code(val) {
    var d, v, i, code = "";

    while (val !== 0 || code.length < 2) { // enforce minimal 2 signs
        v = val % CODEBASE.length;
        val = Math.floor(val / CODEBASE.length);
        d = CODEBASE.slice(v, v + 1);

        code = String(d) + String(code);
    }

    return code;
}

var rkLine = 1,
    rlLine = 1;

function Input(conf) {
    this.cutoffcode = conf.cutoffcode;
    this.cutoffval = code2Value(conf.cutoffcode);
    this.linkMinSize = conf.linkMinSize;
    this.linkMaxSize = conf.linkMaxSize;
    this.spareNumbers = conf.spareNumbers;
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
    this.rectpos = {};
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

function realNum(str) {
    return Number(str.replace(',', '.'));
}

function knoopAsString(knoop) {
    return util.format("'%s'{%s}[%s]<%s|%s>", knoop.code, knoop.id, knoop.status, knoop.oldnr, knoop.newnr);
}

Input.prototype.readKnoop = function (data) {
    rkLine += 1;

    // data members XCoord;YCoord;KNOOPID;VOLGNR;NETWERKID;CODE;STATUS;LON_X;LAT_Y

    var knoop, match;
    try {
        knoop = {
            toString: function () { return knoopAsString(knoop); },
            code: data.CODE,
            codeval: code2Value(data.CODE),
            status: data.STATUS,
            geo: {lat: realNum(data.LAT_Y), lon: realNum(data.LON_X)},
            pos: {x: realNum(data.XCoord), y: realNum(data.YCoord)},
            netwerken: [data.NETWERKID],
            id: data.KNOOPID,
            oldnr: Number(data.VOLGNR),
            newnr: -1,
            targets: {}
        };
        if (knoop.status === 'FUT') { // future knoop is only cosmetics in arcgis editor
            knoop.status = 'NEW';
        }

    } catch (e) {
        this.errKnoop({}, "excpetion during knoop init >> " + e);
        return;
    }

    if (isEmptyCode(knoop.code)) {
        this.errKnoop(knoop, "no code for knoop");
        return; // no need to continue
    }

    if (contains(['TODO', 'OUT'], knoop.status)) {
        this.errKnoop(knoop, "knoop is in a state that is ignored: '" + knoop.status + "'");
        return; // no need to continue
    }

    if (this.knoopByCode.hasOwnProperty(knoop.code)) {
        match = this.knoopByCode[knoop.code];
        if (!containsAll(['FIX', 'DEL', 'IN'], [match.status, knoop.status])) {
            this.errKnoop(knoop,
                          util.format("Knoop-code already in use. This should never happen for status of match [%s] or knoop [%s]!",
                                      match.status, knoop.status));
        }

        if (match.id !== knoop.id || match.oldnr !== knoop.oldnr || match.status !== knoop.status) {
            this.errKnoop(knoop,
                          util.format("matching knoop for code does not match id (%d) oldnr (%d) or status [%s]",
                                      match.id, match.oldnr, match.status));
            return;
        }
        match.netwerken.push(knoop.netwerken[0]);
        knoop = match;
    } else {
        this.knoopByCode[knoop.code] = knoop;

        this.histKnoopStatus[knoop.status] = this.histKnoopStatus[knoop.status] || 0;
        this.histKnoopStatus[knoop.status] += 1;

        this.rectpos.minx = Math.min(this.rectpos.minx || knoop.pos.x, knoop.pos.x);
        this.rectpos.miny = Math.min(this.rectpos.miny || knoop.pos.y, knoop.pos.y);
        this.rectpos.maxx = Math.max(this.rectpos.maxx || knoop.pos.x, knoop.pos.x);
        this.rectpos.maxy = Math.max(this.rectpos.maxy || knoop.pos.y, knoop.pos.y);
    }

    this.maxCodeValue = Math.max(this.maxCodeValue, knoop.codeval);

    if (!this.hasOwnProperty('minNewCodeVal')) {
        this.maxExistCodeVal = code2Value("AA");
        this.minNewCodeVal = code2Value("99");
    }

    if (contains(['IN', 'FIX', 'DEL'], knoop.status)) {
        // node exists in TRIS, possibly re-assigned ext
        this.maxExistCodeVal = (this.maxExistCodeVal >= knoop.codeval) ?
                this.maxExistCodeVal  : knoop.codeval; // the biggest

        if (Number(knoop.id) === 0 || knoop.oldnr === 0) {
            this.errKnoop(knoop, "existing knoop should not have id or volgnr == 0");
        }
        if (knoop.codeval > this.cutoffval) {
            this.errKnoop(knoop,
                          util.format("existing knoop should have code before '%s'(%d)",
                                      this.cutoffcode, this.cutoffval));
        }
    } else if (knoop.status === "EXT") {
        if (knoop.codeval > this.cutoffval) { // new - unknown to TRIS
            knoop.status = "EXTNEW"; // introduce pseudo-status!
            if (Number(knoop.id) !== 0) {
                this.errKnoop(knoop, "knoop in status EXT(NEW) beyond cutoff but must have id == 0");
            }
        } else { // known to tris
            if (knoop.oldnr === 0 || Number(knoop.id) === 0) {
                this.errKnoop(knoop, "knoop in status EXT before cutoff must have known (non zero) id and volgnr");
            }
        }
    } else if (contains(['NEW', 'FIXNEW'], knoop.status)) { // new ones
        this.minNewCodeVal = (this.minNewCodeVal <= knoop.codeval) ?
                this.minNewCodeVal  : knoop.codeval; // the smallest

        if (knoop.codeval < this.cutoffval) {
            this.errKnoop(knoop,
                          util.format("knoop in status NEW should have code beyond '%s'(%d)",
                                      this.cutoffcode, this.cutoffval));
        }

        if (knoop.status === "NEW") { // new
            if (Number(knoop.id) !== 0 || knoop.oldnr !== 0) {
                this.errKnoop(knoop, "knoop in status NEW should have no id and volgnr == 0");
            }
        } else if (knoop.status === "FIXNEW") { // new with fixed volgnr, no id
            if (Number(knoop.id) !== 0 || knoop.oldnr === 0) {
                this.errKnoop(knoop, "knoop in status FIXNEW should have no id and A fixed volgnr != 0");
            }
        } else {
            this.errKnoop(knoop, "strange unexpected status " + knoop.status);
        }
    } else { // unknown
        this.errKnoop(knoop, "knoop-status '" + knoop.status + "' should not occur");
    }

    if (contains(["IN", "FIX"], knoop.status)) { // grab possible southernmost knoop as start-reference
        if (isEmpty(this.startReferenceKnoop) || (this.startReferenceKnoop.geo.lat > knoop.geo.lat)) {
            this.startReferenceKnoop = knoop;
        }
    }
};


function linkAsString(link) {
    return util.format("'%s'{%s}[%s]", link.code, link.pid, link.status);
}

Input.prototype.readLink = function (data) {
    rlLine += 1;

    // data members: XCoord;YCoord;NETWERKID;NETWERK;PID;STATUS;STARTCODE;ENDCODE
    var values, startCode, endCode, link, checkpid, NOMATCH = {}, match = NOMATCH, distance;
    try {
        link = {
            toString: function () { return linkAsString(link); },
            code: "",
            pid: data.PID,
            status: data.STATUS,
            pos: {x: realNum(data.XCoord), y: realNum(data.YCoord)},
            netwerken: [data.NETWERKID]
        };
        if (link.status === 'FUT') { // future link is only cosmetics in arcgis editor
            link.status = 'NEW';
        }
    } catch (e) {
        this.errKnoop({}, "excpetion during link init >> " + e);
        return;
    }

    if (link.status === 'NIV') {
        return; // not to consider NIV links
    }

    if (isEmptyCode(data.STARTCODE) || isEmptyCode(data.ENDCODE)) {
        this.errLink(link, util.format("no start or end-code for link '%s' --> '%s'",
                                       data.STARTCODE, data.ENDCODE));
        return; // no need to continue with this line
    }

    try {
        values = [code2Value(data.STARTCODE), code2Value(data.ENDCODE)].sort();
    } catch (ec2v) {
        this.errLink(link, "error in start or endcode: " + ec2v);
        return;
    }
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

    link.code = startCode + "-" + endCode;

    // find the start and end-nodes by code
    link.start = this.knoopByCode[startCode];
    link.end = this.knoopByCode[endCode];

    // check the spanned distance
    distance = geo.distFromPosInKm(link.start.pos, link.end.pos);
    if (distance < this.linkMinSize && link.status !== 'DEL') {
        this.errLink(link, util.format("link-distance %s is shorter then minimum %s", distance, this.linkMinSize));
    }
    if (distance > this.linkMaxSize && link.status !== 'DEL') {
        this.errLink(link, util.format("link-distance %s is bigger then maximum %s", distance, this.linkMaxSize));
    }

    // check if this code is already in use --> store if not, error if it is
    if (this.linkByCode.hasOwnProperty(link.code)) {
        match = this.linkByCode[link.code];
        if ((match.status === 'DEL' && link.status === 'NEW') || (match.status === 'NEW' && link.status === 'DEL')) {
            // we allow this because it is a re-routing of the trajectory - ensuring save as NEW though
            match.status = 'NEW';
            match.pid = "";
        } else if (!containsAll(['FIX', 'DEL'], [match.status, link.status])) {
            this.errLink(link,
                         util.format("Link-code already in use. This should never happen for status of match [%s] or knoop [%s]!",
                                     match.status, link.status));
        } else if (match.pid !== link.pid || match.start !== link.start || match.end !== link.end) {
            this.errLink(link, util.format("matching link for code does not match pid (%s) " +
                                           "or start '%s' end '%s'", match.pid,
                                           match.start.code, match.end.code));
            return;
        }
        match.netwerken.push(link.netwerken[0]);
        link = match;
    }

    this.linkByCode[link.code] = link;

    this.histLinkStatus[link.status] = this.histLinkStatus[link.status] || 0;
    this.histLinkStatus[link.status] += 1;

    if (!contains(['NEW', 'DEL', 'MIS'], link.status)) {
        // check the knoopids to be matching

        // TODO allow pid == null if status == DEL!
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
    }
    if (link.status === 'NEW' && !isEmptyCode(link.pid)) {
        this.errLink(link, "new links should not have a pid");
    }

    if ((link.start.status === 'DEL' || link.end.status === 'DEL') && link.status !== 'DEL') {
        this.errLink(link, "Links with grensknoop in status DEL, should itself be in status DEL");
    }

    // label the knoop as "mustChange"  if the link.status = DEL or NEW
    if (link.status === 'DEL' || link.status === 'NEW') {
        link.start.mustChange = true;
        link.end.mustChange = true;
    }

    if (link.status !== 'DEL') {
        if (link.start.targets.hasOwnProperty(link.end.code) && link.status !== 'NEW') { // DEL-NEW replacements can yield doubles
            this.errLink(link, util.format("Link Error. Start at '%s' already has link to target '%s'",
                                           link.start.code, link.end.code));
        } else if (link.end.targets.hasOwnProperty(link.start.code) && link.status !== 'NEW') { // DEL-NEW replacements can yield doubles
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


function ReNum() {}
ReNum.KEEP = "keep";
ReNum.TRKP = "try-keep";
ReNum.UPDT = "update";
ReNum.MAKE = "make";
ReNum.ACTIONS = [ReNum.KEEP, ReNum.TRKP, ReNum.UPDT, ReNum.MAKE];

Input.prototype.reportCounts = function () {
    var me = this, maxCountTargets = -1, repMaxCountTargets,
        countKnopen = 0, str;

    this.knoopForNumTargets = [];
    this.histKnoopTargets = {};
    this.knoopSet = {};
    this.histKnoopDeltaStatus = {};
    ReNum.ACTIONS.forEach(function (action) {
        me.knoopSet[action] = [];
        me.histKnoopDeltaStatus[action] = {};
    });

    function insertSorted(arr, newElm, compFn) {
        var minNdx = 0, maxNdx = arr.length, ndx, arrElm, comp;

        while (minNdx < maxNdx) {
            ndx = Math.floor((minNdx + maxNdx) / 2);
            arrElm = arr[ndx];
            comp = compFn(arrElm, newElm);

            if (comp <= 0) {
                minNdx = ndx + 1;
            }
            if (comp >= 0) {
                maxNdx = ndx;
            }
        }
        arr.splice(minNdx, 0, newElm);
    }

    function compareRefDistance(arrKnoop, newKnoop) {
        return (arrKnoop.refDistance - newKnoop.refDistance);
    }

    function addToActionSet(action, knoop) {

        me.histKnoopDeltaStatus[action][knoop.status] = me.histKnoopDeltaStatus[action][knoop.status] || 0;
        me.histKnoopDeltaStatus[action][knoop.status] += 1;

        // don't just push the knoop in the array, but sort it according to distance to start-ref
        knoop.refDistance = geo.distFromPosInKm(me.startReferenceKnoop.pos, knoop.pos);
        insertSorted(me.knoopSet[action], knoop, compareRefDistance);
    }

    // run through the knopen
    Object.keys(this.knoopByCode).forEach(function (code) {
        var knoop = me.knoopByCode[code],
            hasExtTarget = false,
            countTargets = Object.keys(knoop.targets).length;

        maxCountTargets = Math.max(maxCountTargets, countTargets);
        countKnopen += 1;

        if (countTargets < 3 && !contains(['DEL', 'EXT', 'EXTNEW'], knoop.status)) {
            me.errKnoop(knoop, util.format("knoop has not enough targets (=%d) ", countTargets));
        }

        if (knoop.status === 'FIXNEW') {
            Object.keys(knoop.targets).forEach(function (tgtCode) {
                var tgt = me.knoopByCode[tgtCode];
                hasExtTarget = hasExtTarget || (tgt.status === 'EXT' || tgt.status === 'EXTNEW');
            });

            if (!hasExtTarget) {
                me.errKnoop(knoop, "Knoop in status FIXNEW should at least have one target in EXT");
            }
        }

        me.knoopForNumTargets[countTargets] = me.knoopForNumTargets[countTargets] || [];
        me.knoopForNumTargets[countTargets].push(knoop);

        me.histKnoopTargets[countTargets] = me.histKnoopTargets[countTargets] || 0;
        me.histKnoopTargets[countTargets] += 1;

        if (knoop.status === 'NEW') {
            addToActionSet(ReNum.MAKE, knoop);

        } else if (contains(['FIXNEW', 'EXT', 'EXTNEW'], knoop.status)) {
            addToActionSet(ReNum.KEEP, knoop);

        } else if (knoop.status === 'IN') {
            addToActionSet(ReNum.UPDT, knoop);

        } else if (knoop.status === 'FIX') {
            if (knoop.mustChange === true) { // this should grab the FIX with changes in the neighborhoud
                addToActionSet(ReNum.TRKP, knoop);

            } else { // this should grab the FIX that have no changes --> hard must-keep
                addToActionSet(ReNum.KEEP, knoop);

            }
        } else if (knoop.status !== 'DEL') {
            console.log("unexpected knoop.status '" + knoop.status + "' will not be grouped for handling.");
        }
    });

    // calculate rectangle size
    this.rectpos.area = (this.rectpos.maxx - this.rectpos.minx) * (this.rectpos.maxy - this.rectpos.miny) /
        1000000;
    // we should consider the diamond rather then the rectangle
    this.rectpos.diamondArea = this.rectpos.area / 2;
    this.rectpos.avgArea = this.rectpos.diamondArea / countKnopen;
    this.rectpos.avgDist = 2 * Math.sqrt(this.rectpos.avgArea / Math.PI);
    this.rectpos.reuseArea = this.rectpos.avgArea * 99;
    this.rectpos.reuseDist = 2 * Math.sqrt(this.rectpos.reuseArea / Math.PI);
    this.rectpos.reuseGraceDist = Math.round(this.rectpos.reuseDist * 72) / 100; // be graceful and allow a 28% overlap - plus round off on 10m

    console.log("Dimensions: %j", this.rectpos);

    // run through the links
    // TODO compare all links not in 'DEL' to all those that hook up actual knoop in sets (keep, change, create)


    console.log("Allocated Start Ref Knoop: %s @[%s,%s]", this.startReferenceKnoop,
                this.startReferenceKnoop.geo.lat, this.startReferenceKnoop.geo.lon);

    // dump hist counts
    console.log("Count knoop by Status: %j", this.histKnoopStatus);
    console.log("Count knoop by change, by status: %j", this.histKnoopDeltaStatus);
    console.log("Count link by Status: %j", this.histLinkStatus);
    console.log("Count knoop by Number of targets: %j", this.histKnoopTargets);
    console.log("Knoop(en) with most number of targets == [=%d] - counted = %d",
                maxCountTargets, this.knoopForNumTargets[maxCountTargets].length);

    // report exceptionals.
    function reportTargets(from) {
        console.log("\tFrom: '%s'{%d}[%s] :", from.code, from.id, from.status);
        Object.keys(from.targets).forEach(function (tocode) {
            var to = from.targets[tocode].target,
                via = from.targets[tocode].link;
            console.log("\t\tTo: '%s'{%d}[%s] via link {%s}[%s]", to.code, to.id, to.status,
                       via.pid, via.status);
        });
    }

    repMaxCountTargets = maxCountTargets;
    while (repMaxCountTargets > 4) {
        console.log("Knoop(en) With Execpetional number of targets == [=%d]", repMaxCountTargets);
        this.knoopForNumTargets[repMaxCountTargets].forEach(reportTargets);
        repMaxCountTargets -=  1;
    }

    str = "Count knoop by change: {";
    ReNum.ACTIONS.forEach(function (action) {
        str += util.format("'%s': %d,", action, me.knoopSet[action].length);
    });
    str += "}";
    console.log(str);
    
    this.knoopCount = countKnopen;
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
    this.linkMinSize = Number(cmd.min);
    this.linkMaxSize = Number(cmd.MAX);

    if (isNaN(this.linkMinSize) || isNaN(this.linkMaxSize)) {
        throw "can't proceed without valid min max link lengths";
    }

    var spares = [];
    cmd.spare.split(',').forEach(function (n) {
        var nr = Number(n);
        if (isNaN(nr)) {
            throw "Illegal number to keep: '" + nr + "'";
        }
        spares.push(nr);
    });
    this.spareNumbers = spares;
}

Job.prototype.prepare = function (cb) {
    var self = this;

    readInput({
        "knoop": this.knoopbasePath,
        "link": this.linkbasePath,
        "outDir": this.outDirPath,
        "cutoffcode": this.cutoffcode,
        "linkMinSize": this.linkMinSize,
        "linkMaxSize": this.linkMaxSize,
        "spareNumbers": this.spareNumbers
    }, function (data, err) {
        if (err) {
            throw err;
        }
        return cb(data);
    });
};

function NewNumbers() {
    this.knoopDoneByCode = {};
    this.usage = {knoopbynr: {}, linkbycode: {}, linkbynr: {}};
    this.logmsgs = [];
}

NewNumbers.prototype.reportUsage = function (s, short) {
    short = short || false;

    var me = this, sum = 0, nr, cnt, nrset, mindist, friends, friendnrs;
    if (!short) {
        s.write("Usage per volgnr\n");
    }
    for (nr = 1; nr < 100; nr += 1) {
        nrset = me.usage.knoopbynr[nr];
        cnt = nrset ? nrset.length : 0;
        sum += cnt;

        mindist = (nrset && nrset.minDist) ? Math.round(nrset.minDist * 100) / 100 : " N/A ";
        friends = me.usage.linkbynr[nr];
        friendnrs = isEmpty(friends) ? "" : Object.keys(friends).join(",");

        if (!short) {
            s.write(util.format("%s  - used %d - @dist >%s< - Linked To: [%s]\n", nr, cnt, mindist, friendnrs));
        }
    }
    s.write(util.format("--TOTALS--\n\tknopen=%d\n\tlinks=%d\n", sum, Object.keys(this.usage.linkbycode).length));
};

NewNumbers.prototype.reportProgress = function (s) {
    this.reportUsage(s, true);
};

NewNumbers.prototype.log = function (lvl, msg) {
    this.logmsgs.push({lvl: lvl, msg: msg});
};

NewNumbers.prototype.reportLog = function (s) {
    rwcsv.writeStream(s, this.logmsgs, ["lvl", "msg"]);
};

NewNumbers.scoreMsg = "";
NewNumbers.prototype.scoreSuggestedNrForKnoop = function (newnr, knoop, params) {
    var me = this, sameNrSet, minDistSame = 100, linkedByNrs, friendSet, minDistFriend = 200, score = 0;

    sameNrSet = this.usage.knoopbynr[newnr] = this.usage.knoopbynr[newnr] || [];
    sameNrSet.forEach(function (other) {
        var dist = geo.distFromPosInKm(knoop.pos, other.pos);
        if (dist < params.minDist) {
            NewNumbers.scoreMsg = "No reuse of nr " + newnr + " for samedist == " + dist;
            score = NaN; // no score if distance for reuse is too short
        } else {
            minDistSame = Math.min(minDistSame, dist);
        }
    });
    score += (minDistSame - params.minDist); // good - tune up the score with each exces km --> further is best
    // shortstop
    if (isNaN(score)) { return score; }

    Object.keys(knoop.targets).forEach(function (code) {
        var link = knoop.targets[code].link,
            tgt = knoop.targets[code].target,
            lncode;

        if (!isNaN(tgt.newnr) && tgt.newnr !== -1) { // de target is already known
            if (tgt.newnr === newnr) {
                NewNumbers.scoreMsg = "No reuse of nr " + newnr + " because one target already has that nr - " + tgt;
                score = NaN; // no score if the proposed number is the same as one of the links
            }
            lncode = [tgt.newnr, newnr].sort().join(',');
            if (me.usage.linkbycode[lncode]) {
                NewNumbers.scoreMsg = "No reuse of nr " + newnr + " because link already in use - " + lncode;
                score = NaN; // no score if this link is already in use.
            }

            // promote shared digits with known/defined linktargets
            if ((Math.floor(tgt.newnr / 10) === Math.floor(newnr / 10)) ||  (tgt.newnr % 10 === newnr % 10)) {
                score += 5;
            }
        }
    });
    // shortstop
    if (isNaN(score)) { return score; }


    linkedByNrs = this.usage.linkbynr[newnr] = this.usage.linkbynr[newnr] || {};
    Object.keys(linkedByNrs).forEach(function (friendNr) {
        friendSet = me.usage.knoopbynr[friendNr] = me.usage.knoopbynr[friendNr] || [];
        friendSet.forEach(function (other) {
            var dist = geo.distFromPosInKm(knoop.pos, other.pos);
            if (dist < params.minDist * 0.5) { // we are less picky for friends
                NewNumbers.scoreMsg = "No reuse of nr " + newnr + " because frienddist == " + dist + " for friendnr " + friendNr;
                score = NaN; // no score if distance for reuse is too short
            } else {
                minDistFriend = Math.min(minDistFriend, dist);
            }
        });
    });
    score += (minDistFriend - params.minDist) / 2; // good - tune up the score with each exces 2km --> further is best
    // shortstop
    if (isNaN(score)) { return score; }


    // promote the score with 3 times the available expected usages for this nr
    score += (params.expectedUse - sameNrSet.length + 1) * 3;

    return score;
};

NewNumbers.prototype.register = function (newnr, knoop, params) {
    var me = this, sameNrSet;

    newnr = Number(newnr);
    if (contains(params.spareNums, newnr) && !contains(["EXT", "EXTNEW"], knoop.status)) {
        me.log("ERR", util.format("should not register knoop %s for num %d in sparenum %j", knoop, newnr, params.spareNums));
    }

    if (isNaN(newnr)) {
        throw util.format("cannot register knoop %s under undefined", knoop);
    }
    knoop.newnr = newnr;

    sameNrSet = this.usage.knoopbynr[newnr] = this.usage.knoopbynr[newnr] || [];
    // calc dist
    sameNrSet.forEach(function (other) {
        var dist = geo.distFromPosInKm(knoop.pos, other.pos);
        sameNrSet.minDist = Math.min(sameNrSet.minDist || dist, dist);
        if (dist < params.minDist) {
            me.log("ERR", util.format("reusing nr between %s and %s on dist of %s",
                                      knoop, other, Math.round(dist * 100) / 100));
        }
    });

    sameNrSet.push(knoop);
    me.usage.linkbynr[knoop.newnr] = me.usage.linkbynr[knoop.newnr] || {};

    // check all targets of this knoop to see if they landed in a newnr spot already
    Object.keys(knoop.targets).forEach(function (code) {
        var link = knoop.targets[code].link,
            tgt = knoop.targets[code].target,
            lncode;

        if (!isNaN(tgt.newnr) && tgt.newnr !== -1) {
            if (tgt.newnr === knoop.newnr) {
                me.log("ERR", util.format("two same nrs from %s to %s adjecent in link %s", knoop, tgt, link));
            }

            lncode = [tgt.newnr, knoop.newnr].sort().join(',');
            if (me.usage.linkbycode[lncode]) {
                me.log("ERR", util.format("duplicate link-trail %s for %s and %s", lncode, link, me.usage.linkbycode[lncode][0]));
            } else {
                me.usage.linkbycode[lncode] = [];
            }
            me.usage.linkbycode[lncode].push(link);

            me.usage.linkbynr[tgt.newnr] = me.usage.linkbynr[tgt.newnr] || {};
            me.usage.linkbynr[tgt.newnr][knoop.newnr] = me.usage.linkbynr[knoop.newnr][tgt.newnr] = link;
        }
    });
};

NewNumbers.processor = {};
NewNumbers.processor[ReNum.KEEP] = function (knoopSet, params) {
    var me = this;
    console.log("NewNum **1** get through the ones to {keep} #=%d", knoopSet.length);
    knoopSet.forEach(function (knoop) {
        if (knoop.oldnr === 0) { // we don't have a number on these --> so we can't register them
            if (knoop.status === 'EXTNEW') { // this is the only type that can have this!
                knoop.newnr = NaN; // keep track for further linking
            } else {
                throw util.format("unexpected status for a knoop to be kept without a nr -- %s", knoop);
            }
        } else {
            if (!contains(['EXT', 'FIXNEW', 'EXTNEW', 'FIX'], knoop.status)) {
                throw util.format("unexpected status for a knoop that should be kept -- %s", knoop);
            } else {
                me.register(knoop.oldnr, knoop, params);
            }
        }
    });
};

NewNumbers.processor[ReNum.TRKP] = function (knoopSet, params) {
    var me = this, updateSet = [];
    console.log("NewNum **2** get through the ones to {trkp} #=%d", knoopSet.length);

    knoopSet.forEach(function (knoop) {
        // check if we can keep the number - if so register
        if (!isNaN(me.scoreSuggestedNrForKnoop(knoop.oldnr, knoop, params))) {
            me.register(knoop.oldnr, knoop, params);
        } else {
            // if not --> track in retrySet
            me.log("WARN", util.format("cannot keep nr %d for knoop %s -- %s", knoop.oldnr, knoop, NewNumbers.scoreMsg));
            updateSet.push(knoop);
        }
    });

    // now handle the retryset as a pre-update-set
    NewNumbers.processor[ReNum.UPDT].call(me, updateSet, params);
};

NewNumbers.processor[ReNum.UPDT] = function (knoopSet, params) {
    console.log("NewNum **3** get through the ones to {updt} #=%d", knoopSet.length);
};

NewNumbers.processor[ReNum.MAKE] = function (knoopSet, params) {
    console.log("NewNum **4** get through the ones to {make} #=%d", knoopSet.length);
};

NewNumbers.prototype.process = function (action, input) {
    var knoopSet = input.knoopSet[action],
        params = {
            "minDist"     : input.rectpos.reuseGraceDist,
            "spareNums"   : input.spareNumbers,
            "expectedUse" : Math.ceil(input.knoopCount / (100 - input.spareNumbers.length))
        };

    NewNumbers.processor[action].call(this, knoopSet, params);
};


function renumber(input) {
    var nn = new NewNumbers();
    //TODO calculate the suggested mindist between reused knopen.

    console.log("let us finally get started on all (=%d) these knopen",
                Object.keys(input.knoopByCode).length);
    ReNum.ACTIONS.forEach(function (action) {
        nn.process(action, input);
        nn.reportProgress(process.stdout);
    });

    nn.reportUsage(process.stdout);
    nn.reportLog(process.stdout);
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
    return util.format("Workset:" +
                       "\n\tknopen = %s" +
                       "\n\tlinks = %s" +
                       "\n\toutput to %s" +
                       "\n\tapplying cutoff '%s'" +
                       "\n\treporting links outside ]%s,%s[" +
                       "\n\tsparing numbers: %j",
                       this.knoopbasePath, this.linkbasePath, this.outDirPath, this.cutoffcode,
                       this.linkMinSize, this.linkMaxSize, this.spareNumbers);
};


function doWork(cmd) {
    var job = new Job(cmd);
    job.execute();
}

module.exports.doWork = doWork;
