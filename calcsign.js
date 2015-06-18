/*jslint node: true */
/*jslint es5: true */
/*jslint nomen: true */

var scnt = require('./lib/signcount'),
    path = require('path'),
    argv = require('yargs')
        .usage('Telt alle doorverwijsborden per type en plaatst ze ook in bepaalde status.\nUsage: $0')
        .example('$0  -k data/renum/knoop.csv -l data/renum/link.csv -s data/signcount/sign.csv',
                 'Will make the sign-count and associated link-states .')

        .describe('output', 'Output directory to put data in.')
        .alias('o', 'output')
        .default('o', '/tmp/signcount')

        .describe('linkbase', 'Location of linkbase.csv to work with')
        .alias('l', 'linkbase')
        .default('linkbase', path.join(__dirname, 'data', 'signcount', '2015-05-05-result-link.csv'))

        .describe('knoopbase', 'Location of knoopbase.csv to work with')
        .alias('k', 'knoopbase')
        .default('knoopbase', path.join(__dirname, 'data', 'signcount', '2015-05-05-result-knoop.csv'))

        .describe('signbase', 'Location of signbase.csv to work with')
        .alias('s', 'signbase')
        .default('signbase', path.join(__dirname, 'data', 'signcount', '2015-06-17-bord-link-annotated.csv'))

        .argv;

scnt.doCount(argv);
