var fs   = require('fs')
  , util = require('util')
  , csv  = require('csv');


function WorkSet(cmd) {
    this.networkId = cmd.net;
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
            self.count();
            self.mesure();
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

var COLS = [];
for (var c ='a'; c<='z'; c++){
  COLS.push(c);
}
console.log(COLS);

WorkSet.prototype.readLines = function(done){
    var self = this;
    readCSVFile(this.files[0], done, function(linedata){
        console.log("read line: %j", linedata);
        
    });
};

WorkSet.prototype.position = function(){
};

WorkSet.prototype.count = function(){
};

WorkSet.prototype.mesure =function(){
};

WorkSet.prototype.plot =function(){
};

WorkSet.prototype.toString = function() {
    return util.format("Workset:\n\tnet = %s\n\tlinks = %s\n\tfiles = %j", this.networkId, this.linkbasePath, this.files);
}


function BaseData() {
    this.linkByKey  = {};
    this.linkById   = {};
    this.knoopByKey = {};
    this.knoopById  = {};
}


BaseData.prototype.report = function() {
    return util.format("Base loaded knoop - byKey(%d) - byId(%d)\n\tloaded link - byKey(%d) - ById(%d)", 
                      Object.keys(this.knoopByKey).length, Object.keys(this.knoopById).length,
                      Object.keys(this.linkByKey).length, Object.keys(this.linkById).length );
}
    
BaseData.prototype.knoopKey = function(knoop) {
    return [knoop.netwerkids[0], knoop.nr].join("-");
}

BaseData.prototype.linkKey = function(link) {
    var net = Number(link.netwerkid)
      , n1 = Number(link.start.nr)
      , n2 = Number(link.end.nr)
    ;
    
    if (n2 < n1) {
        var h = n1;
        n1=n2; n2=h;
    }
    return [net, n1, n2].join("-");
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

    var knoopKEY = this.knoopKey(knoop);
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
      , "len"      : data.lengte
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
    var linkKEY = this.linkKey(link);
    
    var linksAtKey = this.linkByKey[linkKEY];
    if (!linksAtKey) {
        this.linkByKey[linkKEY] = linksAtKey = [];
    }
    linksAtKey.push(link);

    //link up
    link.start.targets[link.end.nr] = link.end.targets[link.start.nr] = link;
}

BaseData.prototype.addKnoopLink = function(knoop, link) {
    var knoop = this.knoopById[id] || {"nr": nr, "id": id, };

    knoop.KEY = this.knoopKey(link.netwerkid, nr);
    
    var knopenAtKey = this.knoopByKey[knoop.KEY];
    if (!knopenAtKey) {
        this.knoopByKey[knoop.KEY] = knopenAtKey = [];
    }
    knoop.NDX=knopenAtKey.length;
    knopenAtKey[knoop.NDX] = knoop;
    
    return knoop;
}
    

function readCSVFile(path, done, handle) {

    console.log("reading data from ", path);
    
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
    console.log("reading base");
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