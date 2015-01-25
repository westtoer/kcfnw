var fs   = require('fs')
  , util = require('util')
  , csv  = require('csv');


function WorkSet(cmd) {
    this.netblind = cmd.b || false;
    this.type = cmd.t;
    this.netwerkid = cmd.b ? "*" : cmd.net;
    this.linkbasePath = cmd.linkbase;
    this.knoopbasePath= cmd.knoopbase;
    this.files = cmd._;
    this.base;
    this.lines;
}

WorkSet.prototype.execute = function() {
    console.log("Start Verwerking van %s", this);
    var self = this;
    self.prepare(function(ok, err) {
        if (!ok || err) {
            throw util.format("Fout tijdens inladen TRIS data: %s", err);
        }
        
        console.log("TRIS basis ingeladen\nbase.report()==%s", self.base.report());
        self.readLines(function(){
            self.position(self.type);
            self.countUse();
            self.plot();
        });
    });
}

WorkSet.prototype.prepare = function(cb) {
    var self = this;
    if (!self.base) {
        readBaseData({"knoop": this.knoopbasePath, "link": this.linkbasePath, "netblind": this.netblind}, function(data, err) {
            if (err) { throw err; }
            self.base = data;
            return cb(true);
        });
    } else
        return cb(true);
}

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
    if (isNaN(cnt)){ return; }

    var rem = Math.floor(cnt) % 26
      , div = Math.floor(cnt / 26) - 1

    return "knpvolgorde_" + codeChar(div) + codeChar(rem);
}

WorkSet.prototype.readLines = function(done){
    console.log("Inlezen enquete-data");
    var self = this;
    self.lines = [];
    readCSVFile(this.files[0], done, function(linedata){
        var line = {
            "id"        : linedata.ID
          , "netwerkid" : linedata.netwerkid || self.netwerkid
          , "from"      : linedata.Startgemeente.trim()
          , "to"        : linedata.Eindgemeente.trim()
          , "knopen"    : []
        }, cnt = 0, knp;
        while ( (knp = linedata[colName(cnt++)]) && (knp = knp.trim()) && knp.length){
            line.knopen.push(Number(knp));
        }
        if (line.knopen.length) { // only lines with knopen
            self.lines.push(line);
        }
    });
};

WorkSet.prototype.position = function(type){

    var base = this.base
      , typeBase = base.getTypeBase(type);

    var cntLineTraces = [];

    this.lines.forEach( function( line){
        console.log("Start \"tracering\" voor lijn %d", line.id);

        //position the knopen in this line
        var netwerkid = line.netwerkid;
        var traces = [];
        //using every() in stead of forEach() to be able to stop
        line.knopen.every( function( nr, index){

            // run through the knopen in the line, try to (1) position them and (2) link them up
            var positionedKnopen = typeBase.knoopByKey[base.knoopKey(netwerkid, nr)];
            if (index == 0) { // at the start we launch as many traces as positioned start-knopen
                if (!positionedKnopen || positionedKnopen.length == 0){
                    console.log("Nul traces gelanceerd voor lijn %d startend met nr [%d]",
                                line.id, nr);
                    return false;
                } else {
                    console.log("Aanvang met '%d' traces op lijn %d voor nr [%d]",
                                positionedKnopen.length, line.id, nr);
                }
                positionedKnopen.forEach( function( startKnp) {
                    var trace = [startKnp];
                    trace.sumLinkLen = 0;
                    traces.push(trace);
                });

            } else if (traces.length > 0) {
                // for the other knopen in the line we try to link up with the started traces
                // as long as we have any left

                var newTraces = [];
                traces.forEach( function( trace){
                    if ( trace.length %2 != 1) {
                        console.log("FOUT op lijn %d - trace moet altijd oneven lengte hebben (%d)",
                                    line.id, trace.length);
                    }
                    var knp = trace[trace.length-1]; // last element in the trace is the previous knoop
                    if (!knp || !knp.nr) {
                        console.log("FOUT op lijn %d - er is geen knoop op einde van de trace. (%j)",
                                    line.id, knp);
                    }

                    var link = undefined;
                    if (link = knp.targets[nr]) { // if regular knp and valid link
                        trace.push(link);
                        trace.sumLinkLen += link.len;
                        var next = (link.start == knp) ? link.end : link.start; // the other side
                        if (next.nr != nr) { // actually this would indicate a bad base-algorithm
                            throw "Unexpected ERROR: non-matching end of link to target";
                        }
                        trace.push(next);

                    } else if (positionedKnopen.length == 1) {
                        console.log("TOEVALStreffer voor lijn %d @index %d - eenduidige knoop gevonden voor {%d}.", line.id, index, nr);
                        // only try to recover if we get to a single positioned knoop on the other end
                        // push an undefined link between!
                        trace.push(undefined);
                        trace.sumLinkLen = Number.NaN; //can't trust the sum of links any more
                        var next = positionedKnopen[0];
                        trace.push(next);

                    } else {
                        // abandon ship - this trace is going nowhere
                        console.log("Heb 1 trace moeten opgeven voor lijn %d", line.id);
                        console.log("Niet traceerbare lijn op stap %d, van {%s} naar {%s} ", index, knp.nr, nr);
                        trace = undefined;
                    }
                    if (trace) { // only keep active traces
                        newTraces.push(trace);
                    }
                });
                traces = newTraces;
                if (traces.length == 0) {
                    console.log("Geen overblijvende nuttige traces voor lijn %d", line.id);
                    return false;
                }
            }
            return true;
        });

        console.log("Gedaan met traceren op lijn %d", line.id);

        // if more traces are kept, weed traces to those with full coverage, unless none have so
        if (traces.length > 1) {
            // so grab the ok traces
            var okTraceNdx = []
            traces.forEach(function(trace, ndx) {
                if (!isNaN(trace.sumLinkLen)) {
                    okTraceNdx.push(ndx);
                }
            });
            // keep only the ok traces, assuming there is at least one, and there is at least one not
            if (okTraceNdx.length > 0 && okTraceNdx.length < traces.length) {
                var newTraces = [];
                okTraceNdx.forEach(function(ndx){
                    newTraces.push(traces[ndx]);
                });
                traces = newTraces;
            }
        }

        line.traces = traces;
        console.log("Gedaan met uitwieden van overblijvende traces op lijn %d --> %d over", line.id, traces.length);

        // count histograms of number of traces
        cntLineTraces[traces.length] = (cntLineTraces[traces.length] || 0) +1;
    });

    console.log("Traceren van alle lijnen afgelopen voor %d lijnen", this.lines.length);
    console.log("Lijnen hebben volgende distributie van aantal overgehouden traces: %j", cntLineTraces);
    console.log("hoogste aantal traces: %d", cntLineTraces.length - 1);
};

WorkSet.prototype.countUse = function(){
};

WorkSet.prototype.plot = function(){
};

WorkSet.prototype.toString = function() {
    return util.format("Workset:\n\tnet = %s\n\tknopen = %s\n\tlinks = %s\n\tfiles = %j", this.netwerkid, this.knoopbasePath, this.linkbasePath, this.files);
}


function BaseData(netblind) {
    this.netblind   = netblind;
    this.data = {};
}

BaseData.prototype.getTypeBase= function(type) {
    if (this.data[type] == null) {
        this.data[type] =     {
            "type"       : type
          , "linkByKey"  : {}
          , "linkById"   : {}
          , "knoopByKey" : {}
          , "knoopById"  : {}
        };
    }
    return this.data[type];
}

BaseData.prototype.report = function() {
    
    var rep = "Base loaded: \n";
    var self = this;
    Object.keys(this.data).forEach(function(type){
        rep += util.format("\t[TYPE == '%s']\n", type);
        var typeBase = self.getTypeBase(type);
        rep += util.format("\t\tknoop - byKey(%d) - byId(%d)\n",
                           Object.keys(typeBase.knoopByKey).length, Object.keys(typeBase.knoopById).length);
        rep += util.format("\t\tlink - byKey(%d) - byId(%d)\n",
                           Object.keys(typeBase.linkByKey).length, Object.keys(typeBase.linkById).length);
    });
    return rep;
}

BaseData.prototype.keyJoin = function() {
    if (!this.netblind) {
        return Array.prototype.slice.call(arguments, 0).join("-");
    } else {
        return Array.prototype.slice.call(arguments, 1).join("-"); // skip the net - 1st arg
    }
}

BaseData.prototype.knoopKey = function(net, nr) {
    if (arguments.length == 1) {
        var knoop = net;
        net = knoop.netwerkids[0];
        nr = knoop.nr;
    }
    net = Number(net);
    nr = Number(nr);

    return this.keyJoin(net, nr);
}

BaseData.prototype.linkKey = function(net, nr1, nr2) {
    if (arguments.length == 1) {
        var link = net;
        net = link.netwerkid;
        nr1 = link.start.nr;
        nr2 = link.end.nr;
    }

    net = Number(net);
    nr1 = Number(nr1);
    nr2 = Number(nr2);

    if (nr2 < nr1) { var h = nr1; nr1=nr2; nr2=h; }
    return this.keyJoin(net, nr1, nr2);
}

BaseData.prototype.addKnoop = function(data) {

    if (data.codetype != "NETWERK") {
        return;
    }

    var knoop = {
        "id"        : data.knoopid
      , "nr"        : data.volgnr
      , "geom"      : data.geom
      , "netwerkids": [data.netwerkid]
      , "targets"   : []
      , "type"      : data.nettype
    }

    var typeBase = this.getTypeBase(knoop.type);

    if (!knoop.netwerkids[0] || !knoop.nr || !knoop.id) {
        return; // we need all of them!
    }

    var knoopKEY = this.knoopKey(knoop);
    if (!knoopKEY) { return; /* No key available */ }
    
    var exists = typeBase.knoopById[knoop.id];
    if (exists) { //this means this knoop is in multiple networks
        knoop = exists;
        knoop.netwerkids.push(data.netwerkid);
    }
    
    typeBase.knoopById[knoop.id] = knoop;
        
    var knopenAtKey = typeBase.knoopByKey[knoopKEY];
    if (!knopenAtKey) {
        typeBase.knoopByKey[knoopKEY] = knopenAtKey = [];
    }
    knopenAtKey.push(knoop);

}

BaseData.prototype.addLink = function(data) {

    if (data.codetype != "NETWERK") {
        return;
    }

    var link = {
        "id"       : data.id
      , "len"      : Number(data.lengte)
      , "start"    : { id   : data.startknoop }
      , "end"      : { id   : data.endknoop   }
      , "geom"     : data.geom
      , "netwerkid": data.netwerkid
      , "type"     : data.nettype
    }

    var typeBase = this.getTypeBase(link.type);

    if (typeBase.linkById[link.id]) {
        throw "duplicate id for link : " + link.id;
    }
    
    if (!link.netwerkid || !link.start.id || !link.end.id ) {
        return; // we need all of them!
    }
    
    typeBase.linkById[link.id] = link;
    
    link.start = typeBase.knoopById[link.start.id];
    link.end   = typeBase.knoopById[link.end.id];
    var linkKEY = this.linkKey(link);
    
    var linksAtKey = typeBase.linkByKey[linkKEY];
    if (!linksAtKey) {
        typeBase.linkByKey[linkKEY] = linksAtKey = [];
    }
    linksAtKey.push(link);

    //link up
    link.start.targets[link.end.nr] = link.end.targets[link.start.nr] = link;
}

function readCSVFile(path, done, handle) {

    //console.log("reading data from ", path);
    
    fs.createReadStream(path, {encoding: "utf-8"})
        .on('error', function(err) {
            console.log("ERROR reading file %s : %s", path, err);
        })
        .on('end', function() {
            done();
        })
        .pipe(csv.parse({delimiter: ",", columns: true }))
        .pipe(csv.transform(
            function(data) {
                handle( data);
            }, function(err, data){
                if (err) {
                    console.log("ERROR processing line data %j in file %s : %s", data, path, err);
                }
            })
        )
    ;
}

function readBaseData(conf, cb) {
    var base = new BaseData(conf.netblind);
    
    function done() {
        cb(base);
    }
    
    function readLinks() {
        readCSVFile(conf.link, done, function(linkdata){
            base.addLink(linkdata);
        });
    }

    function readKnopen() {
        readCSVFile(conf.knoop, readLinks, function(knoopdata){
            base.addKnoop(knoopdata);
        });
    }
    
    readKnopen();
}

function getDistanceFromLatLonInKm(lat1,lon1,lat2,lon2) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2-lat1);  // deg2rad below
  var dLon = deg2rad(lon2-lon1);
  var a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ;
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  var d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI/180)
}

function process(cmd) {
    var job = new WorkSet(cmd);
    job.execute();
}


module.exports = function(gopts) {
    return {
        process: process
    }
}
module.exports.process = process;
