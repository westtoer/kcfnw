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
    var duplicates = [0,0,0,0,0,0];
    this.lines.forEach(function(line){
        //position the knopen in this line
        var netwerkid = line.netwerkid;
        line.positions = [];
        line.knopen.forEach(function(nr){
            var positions = base.knoopByKey[keyJoin(netwerkid, nr)];
            line.positions.push(positions);
            if (!positions || !positions.length) {
                duplicates[0]++;
            } else {
                duplicates[positions.length]++;
            }
        });
    });
    console.log("duplicates histogram ==> %j", duplicates);
};

WorkSet.prototype.count = function(){
};

WorkSet.prototype.mesure =function(){
};

WorkSet.prototype.plot =function(){
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
                       Object.keys(this.knoopByKey).length, Object.keys(this.knoopById).length);
    return rep;
}

function keyJoin() {
    return Array.prototype.slice.call(arguments, 0).join("-");
}

BaseData.prototype.knoopKey = function(knoop) {
    return keyJoin(knoop.netwerkids[0], knoop.nr);
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
    return keyJoin(net, n1, n2);
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
