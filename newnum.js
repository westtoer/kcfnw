/*jslint node: true */
/*jslint es5: true */
/*jslint nomen: true */

var renum = require('./lib/renum'),
    path = require('path'),
    argv = require('yargs')
        .usage('Herberekend en allokeerd nummers voor optimale spreiding.\nUsage: $0')
        .example('$0  -k data/renum/knoop.csv -l data/renum/link.csv', 'Will process the topology in the files.')
        .describe('output', 'Output directory to put data in.')
        .alias('o', 'output')
        .default('o', '/tmp/renum')
        .describe('linkbase', 'Location of linkbase.csv to work with')
        .alias('l', 'linkbase')
        .default('linkbase', path.join(__dirname, 'data', 'renum', 'link.csv'))
        .describe('knoopbase', 'Location of knoopbase.csv to work with')
        .alias('k', 'knoopbase')
        .default('knoopbase', path.join(__dirname, 'data', 'renum', 'knoop.csv'))
        .describe('cutoff', 'the last known code for existing codes, al new ones should be bigger')
        .alias('c', 'cutoff')
        .default('cutoff', 'TZ')
        .argv;

renum.doWork(argv);
