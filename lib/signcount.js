/*jslint node: true*/

"use strict";
var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    rwcsv = require('./rwcsv.js'),
    async = require('async'),
    DIRECTIONS = {
        "N": "↑",
        "E": "→",
        "W": "←",
        "S": "↓",
        "NW": "↖",
        "NE": "↗",
        "SE": "↘",
        "SW": "↙",
        "CLN": "⬑",
        "CRS": "⬎",
        "CRN": "⬏",
        "CLS": "⬐",
        "UR": "↷",
        "UL": "↶"
    };

function CountJob(cmd) {
    this.config = cmd;
}

CountJob.prototype.readKnoop = function (cb) {
    var me = this;
    rwcsv.read(this.config.knoopbase, cb, function (data) {
        me.input.knoop[data.id] = data;
    }, ",");
};

CountJob.prototype.readLink = function (cb) {
    var me = this;
    rwcsv.read(this.config.linkbase, cb, function (data) {
        me.input.link[data.pid] = data;
    }, ",");
};

CountJob.prototype.readSign = function (cb) {
    var me = this;
    rwcsv.read(this.config.signbase, cb, function (data) {
        me.input.sign.push(data);
    }, ",");
};

CountJob.prototype.read = function (cb) {
    this.input = {
        knoop: {},
        link: {},
        sign: []
    };
    var me = this;

    async.parallel([
        function (cb) { me.readKnoop(cb); },
        function (cb) { me.readLink(cb);  },
        function (cb) { me.readSign(cb);  }
    ], cb);
};

function cloneFill(model, nr, init) {
    return Object.keys(model).reduce(function (tgt, key) {
        tgt[key] = init === null ? model[key] : init;
        return tgt;
    }, {"nr": nr});
}

CountJob.prototype.count = function () {
    var table = [], left = [], me = this, nr = 1,
        count = {
            "all"        : 0,
            "targets"    : 0,
            "unlinked"   : 0,
            "unfit"      : 0,
            "unparsable" : 0,
            "unmatched"  : 0,
            "unknownnew" : 0,
            "linkdel"    : 0,
            "knoopdel"   : 0,
            "found"      : 0
        };

    table.push(cloneFill(DIRECTIONS, "arrows", null));
    for (nr = 1; nr < 100; nr += 1) {
        table[nr] = cloneFill(DIRECTIONS, nr, 0);
    }

    console.log("todo count");
    console.log("knoopbase-size == %d", Object.keys(this.input.knoop).length);
    console.log("linkbase-size  == %d", Object.keys(this.input.link).length);
    console.log("signbase-size  == %d", this.input.sign.length);

    this.result = this.input.sign.reduce(function (res, sign) {
        count.all += 1;
        var pid, link, tgtknoop, txt, dir, oldnr, newnr;

        function err(type) {
            if (txt !== undefined && tgtknoop === undefined) { // only after txt and before tgtknoop calcs
                console.log("%s txt == %s", type, txt);
            }
            count[type] += 1;
            sign.error = type;
            res.left.push(sign);
            return res;
        }

        if (sign.net_type === "NETWERK" && sign.bord_type === "DOORVERWIJSBORD" && sign.mobiliteit === "FIETS") {
            count.targets += 1;
            pid = sign.pid;
            link = me.input.link[pid];
            if (link === undefined || link === null) {
                return err("unlinked");
            } //else
            if (link.oldstatus === "DEL") {
                return err("linkdel");
            } //else

            txt = sign.bord_beschrijving || "--N/A--";
            if (txt.split('#').length !== 1) {
                return err("unfit");
            } //else
            txt = txt.split(',');
            dir = txt[0];
            oldnr = Number(txt[1]);
            if (isNaN(oldnr) || oldnr < 1 || oldnr > 99 || !Object.keys(DIRECTIONS).some(function (d) { return (d === dir); })) {
                return err("unparsable");
            } // else
            tgtknoop = [sign.startknoop, sign.endknoop].reduce(function (tgt, id) {
                var knp = me.input.knoop[id];
                if (oldnr === Math.abs(Number(knp.oldnr))) { tgt = knp; }
                return tgt;
            }, null);
            if (tgtknoop === null) {
                console.log("no match for sign %j to either start=%j or end=%j", sign, me.input.knoop[sign.startknoop], me.input.knoop[sign.endknoop]);
                return err("unmatched");
            } //else
            newnr = Number(tgtknoop.newnr);

            if (tgtknoop.oldstatus === "DEL") {
                return err("knoopdel");
            }

            if (isNaN(newnr) || newnr < 1 || newnr > 99) {
                return err("unknownnew");
            } //else

            res.table[newnr][dir] += 1;
            count.found += 1;
        }
        return res;
    }, { "table" : table, "left": left });

    //console.log(this.result);
    console.log("count == %j", count);
};

CountJob.prototype.write = function () {
    var outDir = this.config.output,
        countcols = Object.keys(DIRECTIONS);

    countcols.splice(0, 0, "nr");   // add column in front
    this.result.table.splice(0, 1); // remove the 0 line
    rwcsv.write(path.join(outDir, "sign-count.csv"), this.result.table,
                countcols);

    rwcsv.write(path.join(outDir, "sign-manual.csv"), this.result.left,
                ["FID", "paal_nummer", "startknoop", "endknoop", "pid", "paal_type", "bord",
                 "bord_type", "net_type", "mobiliteit", "bord_beschrijving", "geom", "error"]);
};

function doCount(cmd) {
    console.log(cmd);

    var countJob = new CountJob(cmd);
    countJob.read(function () {
        countJob.count();
        countJob.write();
    });

}

module.exports.doCount = doCount;
