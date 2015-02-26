/*jslint node: true*/

"use strict";
var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    rwcsv = require('./rwcsv.js'),
    geo = require('./geo-util.js');


function BaseData(netblind) {
    this.netblind = netblind;
    this.data = {};
}

BaseData.prototype.getTypeBase = function (type) {
    if (this.data[type] === null || this.data[type] === undefined) {
        this.data[type] = {
            "type": type,
            "linkByKey": {},
            "linkById": {},
            "knoopByKey": {},
            "knoopById": {},
            "knoopByGeoId": {}
        };
    }
    return this.data[type];
};

BaseData.prototype.report = function (type, netwerkid) {
    var rep = "Base loaded: \n",
        self = this;

    Object.keys(this.data).forEach(function (type) {
        rep += util.format("\t[TYPE == '%s']\n", type);
        var typeBase = self.getTypeBase(type);
        rep += util.format("\t\tknoop - byKey(%d) - byId(%d)\n",
            Object.keys(typeBase.knoopByKey).length,
            Object.keys(typeBase.knoopById).length);
        rep += util.format("\t\tlink - byKey(%d) - byId(%d)\n",
            Object.keys(typeBase.linkByKey).length,
            Object.keys(typeBase.linkById).length);
    });

    return rep;
};

BaseData.prototype.statsCSV = function (outDir) {
    var self = this;
    Object.keys(this.data).forEach(function (type) {
        // report on some stats of the base of this type.
        var typeBase = self.getTypeBase(type),
            knoopStatsData = [],
            csvName = util.format("base-stats-knopen-%s.csv", type.toLowerCase());

        Object.keys(typeBase.knoopByKey).forEach(function (key) {
            var atkey = typeBase.knoopByKey[key],
                stats = atkey.stats;
            knoopStatsData.push({
                "id": key,
                "cnt": atkey.length,
                "avg": stats.avg,
                "min": stats.min,
                "minatlat1": stats.minat.from.lat,
                "minatlon1": stats.minat.from.lon,
                "minatlat2": stats.minat.to.lat,
                "minatlon2": stats.minat.to.lon,
                "type": type
            });
        });
        rwcsv.write(path.join(outDir, csvName), knoopStatsData, ["id", "cnt", "avg", "min",
                      "minatlat1", "minatlon1", "minatlat2", "minatlon2", "type"]);
    });
};

BaseData.prototype.keyJoin = function () {
    if (!this.netblind) {
        return Array.prototype.slice.call(arguments, 0).join("-");
    } else {
        return Array.prototype.slice.call(arguments, 1).join("-"); // skip the net - 1st arg
    }
};

BaseData.prototype.knoopKey = function (net, nr) {
    if (arguments.length === 1) {
        var knoop = net;
        net = knoop.netwerkids[0];
        nr = knoop.nr;
    }
    net = Number(net);
    nr = Number(nr);

    return this.keyJoin(net, nr);
};

BaseData.prototype.linkKey = function (net, nr1, nr2) {
    var link, h;

    if (arguments.length === 1) {
        link = net;
        net = link.netwerkid;
        nr1 = link.start.nr;
        nr2 = link.end.nr;
    }

    net = Number(net);
    nr1 = Number(nr1);
    nr2 = Number(nr2);

    if (nr2 < nr1) {
        h = nr1;
        nr1 = nr2;
        nr2 = h;
    }
    return this.keyJoin(net, nr1, nr2);
};

function DistStats() {
    this.init(0);
}

DistStats.prototype.init = function (val, geo1, geo2) {
    this.avg = this.min = this.max = val;
    this.cnt = 0;
    if (geo1 && geo2) {
        this.minat = {
            from: geo1,
            to: geo2
        };
    } else {
        this.minat = {
            from: {
                lat: "#",
                lon: "#"
            },
            to: {
                lat: "#",
                lon: "#"
            }
        };
    }
};

DistStats.prototype.addDist = function (dist, geo1, geo2) {
    if (this.cnt === 0) {
        this.init(dist, geo1, geo2);
    } else {
        this.avg = ((this.avg * this.cnt) + dist) / (this.cnt + 1);
        this.max = Math.max(dist, this.max);

        if (this.min > dist) {
            this.min = dist;
            this.minat = {
                from: geo1,
                to: geo2
            };
        }
    }
    this.cnt += 1;
};

DistStats.prototype.report = function () {
    var rep = util.format("Count = %s | Average=%s | Maximum = %s | Minimum=%s @(%s,%s)-->(%s,%s)",
        this.cnt, this.avg, this.max, this.min,
        this.minat.from.lat, this.minat.from.lon,
        this.minat.to.lat, this.minat.to.lon);
    return rep;
};

BaseData.prototype.addKnoop = function (data) {

    if (data.codetype !== "NETWERK") {
        return;
    }

    var knoop = {
            "id": data.knoopid,
            "geoid": data.geoid,
            "nr": Number(data.volgnr),
            "geom": data.geom,
            "netwerkids": [data.netwerkid],
            "targets": [],
            "type": data.nettype,
            "geo": geo.wktPoint2LatLon(data.geom),
            "CLASS": "KNOOP"
        },
        typeBase = this.getTypeBase(knoop.type),
        knoopKEY,
        exists,
        knopenAtKey,
        dist;

    if (!knoop.netwerkids[0] || !knoop.nr || !knoop.id) {
        return; // we need all of them!
    }

    knoopKEY = this.knoopKey(knoop);
    if (!knoopKEY) {
        return; /* No key available */
    }

    exists = typeBase.knoopByGeoId[knoop.geoid];
    if (exists) { //this means this knoop is in multiple networks
        knoop = exists;
        knoop.netwerkids.push(data.netwerkid);
    }

    typeBase.knoopById[knoop.id] = knoop;
    typeBase.knoopByGeoId[knoop.geoid] = knoop;

    knopenAtKey = typeBase.knoopByKey[knoopKEY];
    if (!knopenAtKey) {
        typeBase.knoopByKey[knoopKEY] = knopenAtKey = [];
        knopenAtKey.stats = new DistStats();
    }

    if (!exists) { // only for new geoid knopen we need to:
        // calculate all distances to the other before adding
        knopenAtKey.forEach(function (other) {
            if (knoop !== other) { // if knoop exists, then it is already in the list
                dist = geo.distFromGeoInKm(knoop.geo, other.geo);
                knopenAtKey.stats.addDist(dist, knoop.geo, other.geo);
            }
        });

        // knoop that already existed was changed, but does not need to be pushed again
        knopenAtKey.push(knoop);
    }
};

BaseData.prototype.addLink = function (data) {

    if (data.codetype !== "NETWERK") {
        return;
    }

    var link = {
            "id": data.id,
            "len": Number(data.lengte),
            "start": {
                id: data.startknoop
            },
            "end": {
                id: data.endknoop
            },
            "geom": data.geom,
            "netwerkid": data.netwerkid,
            "type": data.nettype,
            "CLASS": "LINK"
        },
        typeBase = this.getTypeBase(link.type),
        linkKEY,
        linksAtKey;

    if (typeBase.linkById[link.id]) {
        throw "duplicate id for link : " + link.id;
    }

    if (!link.netwerkid || !link.start.id || !link.end.id) {
        return; // we need all of them!
    }

    typeBase.linkById[link.id] = link;

    function getKnoop(knpid) {
        var knoop = typeBase.knoopById[knpid];
        if (knoop === null || knoop === undefined) {
            console.log("no linked node for id = %s in link = %j", knpid, link);
        }
        return knoop;
    }

    link.start = getKnoop(link.start.id);
    link.end = getKnoop(link.end.id);
    linkKEY = this.linkKey(link);

    linksAtKey = typeBase.linkByKey[linkKEY];
    if (!linksAtKey) {
        typeBase.linkByKey[linkKEY] = linksAtKey = [];
    }
    linksAtKey.push(link);

    //link up
    link.start.targets[link.end.nr] = link.end.targets[link.start.nr] = link;
};

function readBaseData(conf, cb) {
    var base = new BaseData(conf.netblind);

    function done() {
        cb(base);
    }

    function readLinks() {
        rwcsv.read(conf.link, done, function (linkdata) {
            base.addLink(linkdata);
        });
    }

    function readKnopen() {
        rwcsv.read(conf.knoop, readLinks, function (knoopdata) {
            base.addKnoop(knoopdata);
        });
    }

    readKnopen();
}


function WorkSet(cmd) {
    this.netblind = cmd.b || false;
    this.recovery = cmd.r || false;
    this.type = cmd.t;
    this.netwerkid = cmd.b ? "*" : cmd.net;
    this.linkbasePath = cmd.linkbase;
    this.knoopbasePath = cmd.knoopbase;
    this.outDirPath = cmd.output;
    /*jslint nomen: true */
    this.files = cmd._;
    /*jslint nomen: false */
    this.base = undefined;
    this.lines = undefined;
}

WorkSet.prototype.execute = function () {
    console.log("Start Verwerking van %s", this);
    var self = this,
        type = this.type;

    self.prepare(function (ok, err) {
        if (!ok || err) {
            throw util.format("Fout tijdens inladen TRIS data: %s", err);
        }

        console.log("TRIS basis ingeladen\nbase.report()==%s",
            self.base.report(type));
        self.base.statsCSV(self.outDirPath);
        self.readLines(function () {
            self.position(type);
            self.positionLogCSV(self.outDirPath);
            self.countUse();
            self.results.to(self.outDirPath);
        });
    });
};

WorkSet.prototype.prepare = function (cb) {
    var self = this;

    if (!self.base) {
        readBaseData({
            "knoop": this.knoopbasePath,
            "link": this.linkbasePath,
            "netblind": this.netblind
        }, function (data, err) {
            if (err) {
                throw err;
            }
            self.base = data;
            return cb(true);
        });
    } else {
        return cb(true);
    }
};

function codeChar(num) {
    if (num > 25) {
        throw "Hoogste letter-code overschreden";
    }
    if (num < 0) {
        return '';
    }
    return String.fromCharCode('a'.charCodeAt(0) + num);
}

function colName(cnt) {
    cnt = Number(cnt);
    if (isNaN(cnt)) {
        return;
    }

    var rem = Math.floor(cnt) % 26,
        div = Math.floor(cnt / 26) - 1;

    return "knpvolgorde_" + codeChar(div) + codeChar(rem);
}

WorkSet.prototype.readLines = function (done) {
    console.log("Inlezen enquete-data");
    var self = this;
    self.lines = [];

    rwcsv.read(this.files[0], done, function (linedata) {
        var line = {
                "id": linedata.ID,
                "netwerkid": linedata.netwerkid || self.netwerkid,
                "from": linedata.Startgemeente.trim(),
                "to": linedata.Eindgemeente.trim(),
                "knopen": []
            },
            cnt = 0,
            knp,
            readCols = true;

        while (readCols) {
            knp = linedata[colName(cnt)];
            knp = (knp !== null && knp !== undefined) ? knp.trim() : "";
            if (knp.length > 0) {
                cnt += 1;
                line.knopen.push(Number(knp));
            } else {
                readCols = false;
            }
        }
        if (line.knopen.length) { // only lines with knopen
            self.lines.push(line);
        }
    });
};

WorkSet.prototype.position = function (type) {
    var plog = [],
        base = this.base,
        typeBase = base.getTypeBase(type),
        cntLineTraces = [],
        recovery = this.recovery || false,
        dblTraceCount;

    this.positionLog = plog;

    function logpos(lid, ndx, trcnt, trndx, trclen, prev, current, code, comment) {
        plog.push([lid, ndx, trcnt, trndx, trclen, prev, current, code, comment]);
    }




    this.lines.forEach(function (line) {
        logpos(line.id, -1, -1, -1, -1, "#", "#", "BEGIN", "positioning");

        //position the knopen in this line
        var netwerkid = line.netwerkid,
            traces = [],
            okTraceNdx = [],
            newTraces = [];

        //using every() in stead of forEach() to be able to stop
        line.knopen.every(function (nr, index) {

            // run through the knopen in the line, try to (1) position them and (2) link them up
            var positionedKnopen = typeBase.knoopByKey[base.knoopKey(netwerkid, nr)],
                newTraces = [];

            if (index === 0) { // at the start we launch as many traces as positioned start-knopen
                if (!positionedKnopen || positionedKnopen.length === 0) {
                    logpos(line.id, index, -1, -1, -1, "#", nr, "QUIT", "no trace started");
                    return false;
                }

                logpos(line.id, index, positionedKnopen.length, -1, -1, "#", nr,
                    "INIT", "initial positions found");
                positionedKnopen.forEach(function (startKnp) {
                    var trace = [startKnp];
                    trace.sumLinkLen = 0;
                    traces.push(trace);
                });
                logpos(line.id, index, traces.length, -1, -1, "#", nr,
                    "INIT ECHO", "traces started");

            } else if (traces.length > 0) {
                // for the other knopen in the line we try to link up with the started traces
                // of course, only as long as we have any left

                traces.forEach(function (trace, tracendx) {
                    if (trace.length % 2 !== 1) {
                        throw util.fotrmat("FOUT op lijn %d - trace moet altijd oneven lengte hebben (%d)",
                            line.id, trace.length);
                    }
                    var knp = trace[trace.length - 1], // last element in the trace is the previous knoop
                        link,
                        next;

                    if (!knp || !knp.nr) {
                        throw util.format("FOUT op lijn %d - er is geen knoop op einde van de trace. (%j)",
                            line.id, knp);
                    }

                    link = knp.targets[nr];
                    if (link) { // if regular knp and valid link
                        trace.push(link);
                        trace.sumLinkLen += link.len;
                        next = (link.start === knp) ? link.end : link.start; // the other side
                        if (next.nr !== nr) { // actually this would indicate a bad base-algorithm
                            throw "Unexpected ERROR: non-matching end of link to target - expected " + Object.prototype.toString.call(nr) + " instead got " + Object.prototype.toString.call(next.nr);
                        }
                        trace.push(next);
                        logpos(line.id, index, traces.length, tracendx, trace.sumLinkLen, knp.nr, nr,
                            "PROGRESS", "regular link found");

                    } else if (recovery && positionedKnopen.length === 1) {
                        // only try to recover if we get to a single positioned knoop on the other end
                        // push an undefined link between!
                        trace.push(undefined);
                        trace.sumLinkLen = NaN; //can't trust the sum of links any more
                        logpos(line.id, index, traces.length, tracendx, trace.sumLinkLen, knp.nr, nr,
                            "RECOVER", "regular link missing, lucky recover by unique found knoop, mark trace as lesser");
                        next = positionedKnopen[0];
                        trace.push(next);

                    } else {
                        logpos(line.id, index, traces.length, tracendx, trace.sumLinkLen, knp.nr, nr,
                            "QUIT", "missing link between knopen ==> trace-erased on this trace_index");
                        trace = undefined;
                    }
                    if (trace) { // only keep active traces
                        newTraces.push(trace);
                    }
                });
                traces = newTraces;
                if (traces.length === 0) {
                    logpos(line.id, index, traces.length, -1, -1, "#", nr,
                        "STOP", "no more active traces for this line");
                    return false;
                }
                logpos(line.id, index, traces.length, -1, -1, "#", nr,
                    "NEXT", "done evaluating traces at this index");
            }
            return true;
        });

        logpos(line.id, -1, traces.length, -1, -1, "#", "#",
            "DONE", "done tracing this line");

        // if more traces are kept, weed traces to those with full coverage, unless none have so
        if (traces.length > 1) {
            // so grab the ok traces

            traces.forEach(function (trace, ndx) {
                if (!isNaN(trace.sumLinkLen)) {
                    okTraceNdx.push(ndx);
                }
            });
            // keep only the ok traces, assuming there is at least one, and there is at least one not
            if (okTraceNdx.length > 0 && okTraceNdx.length < traces.length) {
                okTraceNdx.forEach(function (ndx) {
                    newTraces.push(traces[ndx]);
                });
                traces = newTraces;
            }
        }

        line.traces = traces;
        logpos(line.id, -1, traces.length, -1, -1, "#", "#",
            "END", "done removing lesser valued traces for this line");

        // count histograms of number of traces
        cntLineTraces[traces.length] = (cntLineTraces[traces.length] || 0) + 1;
    });

    console.log("\n==\nStats Positioning\n==");
    console.log("Tracing-positioning-cleanup done for %d lines", this.lines.length);
    console.log("Distribution (counted lines) per number of matching traces %j", cntLineTraces);
    console.log("Max numberof matching traces: %d", cntLineTraces.length - 1);
    console.log("    No    traces found for %d lines (= %s %)",
        cntLineTraces[0], Math.round(100 * cntLineTraces[0] / this.lines.length, -1));
    console.log("  Unique  traces found for %d lines (= %s %)",
        cntLineTraces[1], Math.round(100 * cntLineTraces[1] / this.lines.length, -1));
    dblTraceCount = this.lines.length - (cntLineTraces[0] + cntLineTraces[1]);
    console.log("Ambiguous traces found for %d lines (= %s %)",
        dblTraceCount, Math.round(100 * dblTraceCount / this.lines.length, -1));
    console.log("==\n");
};

WorkSet.prototype.positionLogCSV = function (outDir) {
    rwcsv.write(path.join(outDir, "dbglog-positioning.csv"), this.positionLog, ["line_id", "index_in_line", "active_traces", "current_trace_index", "current_trace_length",
            "previous", "current", "status_code", "comment"]);
};


function ResultSet() {
    this.knoopStatsById = {};
    this.linkStatsById = {};
    this.lineStatsById = {};

    this.maxKnoopUseCnt = 0;
    this.maxLinkUseCnt = 0;
}

ResultSet.prototype.countKnoop = function (knoop) {
    var id = knoop.id,
        knoopStats = this.knoopStatsById[id];

    if (knoopStats === null || knoopStats === undefined) { // not yet listed - first count for knoop
        this.knoopStatsById[id] = knoopStats = {
            "id": id,
            "lbl": knoop.nr,
            "wkt": knoop.geom,
            "geolat": knoop.geo.lat,
            "geolon": knoop.geo.lon,
            "usecnt": 0
        };
    }

    knoopStats.usecnt += 1;
    this.maxKnoopUseCnt = Math.max(this.maxKnoopUseCnt, knoopStats.usecnt);
};

ResultSet.prototype.countLink = function (link) {
    var id = link.id,
        linkStats = this.linkStatsById[id];

    if (linkStats === null || linkStats === undefined) { // not yet listed - first count for link
        this.linkStatsById[id] = linkStats = {
            "id": id,
            "lbl": [link.start.nr, link.end.nr].sort().join("-"),
            "pid": [link.start.id, link.end.id].sort().join("-"), //persistent-id
            "start": link.start.id,
            "end": link.end.id,
            "dist": link.len,
            "usecnt": 0,
            "wkt": link.geom
        };
    }

    linkStats.usecnt += 1;
    this.maxLinkUseCnt = Math.max(this.maxLinkUseCnt, linkStats.usecnt);
};

ResultSet.prototype.countLine = function (line) {
    var id = line.id,
        trace = line.traces[0];

    if (this.lineStatsById[id] !== null && this.lineStatsById[id] !== undefined) {
        throw util.format("Error duplicate reported line with id = %d", id);
    }
    //else

    this.lineStatsById[id] = {
        "id": id,
        "hops": (trace.length + 1) / 2, //trace holds 2n+1 elements of which n+1 knopen (hops) and n links
        "dist": trace.sumLinkLen,
        "lus": (trace[0] === trace[trace.length - 1]) // if start == end
    };
};

ResultSet.prototype.to = function (outDir) {

    //TODO use csv lib to stream/serialize output to various files
    rwcsv.write(path.join(outDir, "knoop-use.csv"), this.knoopStatsById, ["id", "lbl", "usecnt", "wkt"]);

    rwcsv.write(path.join(outDir, "link-use.csv"), this.linkStatsById, ["id", "pid", "lbl", "start", "end", "dist", "usecnt", "wkt"]);

    rwcsv.write(path.join(outDir, "line-report.csv"), this.lineStatsById, ["id", "hops", "dist", "lus"]);
};

WorkSet.prototype.countUse = function () {
    // run through all the lines
    var results = this.results = new ResultSet();

    this.lines.forEach(function (line) {

        //position the knopen in this line
        var traces = line.traces;

        if (traces.length !== 1) {
            return; // no unique match - useless questionaire line --> no counts
        }
        //else

        traces[0].forEach(function (element) {
            //trace-arrays contain knopen and links alternatively, both can be counted
            if (element.CLASS === "KNOOP") {
                results.countKnoop(element);
            } else if (element.CLASS === "LINK") {
                results.countLink(element);
            } else {
                throw util.format("ERROR - unknown trace element in line %d - type = %s",
                    line.id, element.CLASS);
            }
        });

        results.countLine(line);
    });
};


WorkSet.prototype.toString = function () {
    return util.format("Workset:\n\tnet = %s\n\tknopen = %s\n\tlinks = %s\n\tfiles = %j", this.netwerkid, this.knoopbasePath, this.linkbasePath, this.files);
};


function doWork(cmd) {
    var job = new WorkSet(cmd);
    job.execute();
}


module.exports = function (gopts) {
    return {
        doWork: doWork
    };
};
module.exports.doWork = doWork;
