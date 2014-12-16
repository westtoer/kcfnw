var fs   = require('fs')
  , util = require('util')
  , csv  = require('csv');


function WorkSet(cmd) {
    this.netwerkid = cmd.net;
    this.linkbasePath = cmd.linkbase;
    this.knoopbasePath= cmd.knoopbase;
    this.files = cmd._;
    this.base;
    this.lines;
}

WorkSet.prototype.execute = function() {
    console.log("processing %s", this);
    var self = this;
    self.prepare(function(ok, err) {
        if (!ok || err) {
            throw util.format("Error during preparation: %s", err);
        }
        
        console.log("ready for action with\nbase.report()==%s", self.base.report());
        
        self.readLines(function(){
            self.position();
            self.countUse();
            self.plot();
        });
    });
}

WorkSet.prototype.prepare = function(cb) {
    var self = this;
    if (!self.base) {
        readBaseData({"knoop": this.knoopbasePath, "link": this.linkbasePath}, function(data, err) {
            if (err) { throw err; }
            self.base = data;
            return cb(true);
        });
    } else
        return cb(true);
}

function codeChar(num) {
    if (num > 25) {
        throw "hoogste code overschreden";
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
        if (line.knopen.length) { // only lines
            self.lines.push(line);
        }
    });
};

WorkSet.prototype.position = function(){
    var base = this.base;
    var cntLineTraces = [];

    this.lines.forEach( function( line){
        console.log("starting positioning work on %d", line.id);

        //position the knopen in this line
        var netwerkid = line.netwerkid;
        var traces = [];
        line.knopen.forEach( function( nr, index){

            // run through the knopen in the line, try to (1) position them and (2) link them up
            var positionedKnopen = base.knoopByKey[BaseData.knoopKey(netwerkid, nr)];
            if (index == 0) { // at the start we launch as many traces as positioned start-knopen
                if (positionedKnopen.length == 0){
                    console.log("can't even launch traces on line %d", line.id);
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
                        console.log("Error on line %d - each trace should always be odd length (%d)", line.id, trace.length);
                    }
                    var knp = trace[trace.length-1]; // last element in the trace is the previous knoop
                    if (!knp || !knp.nr) {
                        console.log("Error on line %d - we don't have a knp at the end of the trace", line.id);
                    }

                    var link = undefined;
                    if (link = knp.targets[nr]) { // if regular knp and valid link
                        trace.push(link);
                        trace.sumLinkLen += link.len;
                        var next = (link.start == knp) ? link.end : link.start; // the other side
                        if (next.nr != nr) { // actually this would indicate a bad base-algorithm
                            throw "unexpected error non-matching end of link to target";
                        }
                        trace.push(next);

                    } else if (positionedKnopen.length == 1) {
                        console.log("lucky recovery for line %d @index %d", line.id, index);
                        // only try to recover if we get to a single positioned knoop on the other end
                        // push an undefined link between!
                        trace.push(undefined);
                        trace.sumLinkLen = Number.NaN; //can't trust the sum of links any more
                        var next = positionedKnopen[0];
                        trace.push(next);

                    } else {
                        // abandon ship - this trace is going nowhere
                        console.log("had to abandon 1 trace for line %d", line.id);
                        console.log("untracable @index %d, from %s to %d with foundknopen == ", index, knp.nr, nr, positionedKnopen.length);
                        trace = undefined;
                    }
                    if (trace) { // only keep active traces
                        newTraces.push(trace);
                    }
                });
                traces = newTraces;
                if (traces.length == 0) {
                    console.log("no more working traces for line %d", line.id);
                }
            }
        });

        console.log("done tracing knopen on line no. %d", line.id);

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
        console.log("done weeding traces on line no. %d --> %d", line.id, traces.length);

        // count histograms of number of traces
        cntLineTraces[traces.length] = (cntLineTraces[traces.length] || 0) +1;
    });

    console.log("positioning done on %d lines with trace-count-distribution %j",
                this.lines.length, cntLineTraces);
};

WorkSet.prototype.countUse = function(){
};

WorkSet.prototype.plot = function(){
};

WorkSet.prototype.toString = function() {
    return util.format("Workset:\n\tnet = %s\n\tknopen = %s\n\tlinks = %s\n\tfiles = %j", this.networkId, this.knoopbasePath, this.linkbasePath, this.files);
}


function BaseData() {
    this.linkByKey  = {};
    this.linkById   = {};
    this.knoopByKey = {};
    this.knoopById  = {};
}

BaseData.prototype.report = function() {
    
    var rep = "Base loaded: \n";
    rep += util.format("\tknoop - byKey(%d) - byId(%d)\n",
                       Object.keys(this.knoopByKey).length, Object.keys(this.knoopById).length);
    rep += util.format("\tlink - byKey(%d) - byId(%d)\n",
                       Object.keys(this.linkByKey).length, Object.keys(this.linkById).length);
    return rep;
}

function keyJoin() {
    return Array.prototype.slice.call(arguments, 0).join("-");
}

BaseData.knoopKey = function(net, nr) {
    if (arguments.length == 1) {
        var knoop = net;
        net = knoop.netwerkids[0];
        nr = knoop.nr;
    }
    net = Number(net);
    nr = Number(nr);

    return keyJoin(net, nr);
}

BaseData.linkKey = function(net, nr1, nr2) {
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
    return keyJoin(net, nr1, nr2);
}

BaseData.prototype.addKnoop = function(data) {
    var knoop = {
        "id"        : data.knoopid
      , "nr"        : data.volgnr
      , "geom"      : data.geom
      , "netwerkids": [data.netwerkid]
      , "targets"   : []
    }

    if (!knoop.netwerkids[0] || !knoop.nr || !knoop.id) {
        return; // we need all of them!
    }

    var knoopKEY = BaseData.knoopKey(knoop);
    if (!knoopKEY) { return; /* No key available */ }
    
    var exists = this.knoopById[knoop.id];
    if (exists) { //this means this knoop is in multiple networks
        knoop = exists;
        knoop.netwerkids.push(data.netwerkid);
    }
    
    this.knoopById[knoop.id] = knoop;
        
    var knopenAtKey = this.knoopByKey[knoopKEY];
    if (!knopenAtKey) {
        this.knoopByKey[knoopKEY] = knopenAtKey = [];
    }
    knopenAtKey.push(knoop);

}

BaseData.prototype.addLink = function(data) {
     var link = {
        "id"       : data.id
      , "len"      : Number(data.lengte)
      , "start"    : { id   : data.startknoop }
      , "end"      : { id   : data.endknoop   }
      , "geom"     : data.geom
      , "netwerkid": data.netwerkid
    }

    if (this.linkById[link.id]) { 
        throw "duplicate id for link : " + link.id;
    }
    
    if (!link.netwerkid || !link.start.id || !link.end.id ) {
        return; // we need all of them!
    }
    
    this.linkById[link.id] = link;
    
    link.start = this.knoopById[link.start.id];
    link.end   = this.knoopById[link.end.id];
    var linkKEY = BaseData.linkKey(link);
    
    var linksAtKey = this.linkByKey[linkKEY];
    if (!linksAtKey) {
        this.linkByKey[linkKEY] = linksAtKey = [];
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
        .pipe(csv.transform( function(data) {
            handle( data); 
        }))
    ;
}

function readBaseData(paths, cb) {
    var base = new BaseData();
    
    function done() {
        cb(base);
    }
    
    function readLinks() {
        readCSVFile(paths.link, done, function(linkdata){
            base.addLink(linkdata);
        });
    }

    function readKnopen() {
        readCSVFile(paths.knoop, readLinks, function(knoopdata){
            base.addKnoop(knoopdata);
        });
    }
    
    readKnopen();
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
