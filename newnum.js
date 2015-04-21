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
        .alias('m', 'min')
        .default('min', 0.165)
        .describe('min', 'the shortest links that do not need reporting')
        .alias('M', 'MAX')
        .default('MAX', 10.0)
        .describe('MAX', 'the longest links that do not need reporting')
        .alias('c', 'cutoff')
        .default('cutoff', 'T0')
        .describe('spare', 'the numbers to spare and not use')
        .alias('s', 'cutoff')
        .default('spare', '7,19,37,41,43,51,79,87,91')
        .argv;

renum.doWork(argv);
