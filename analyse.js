/*jslint node: true */
/*jslint es5: true */
/*jslint nomen: true */

var kcfnw = require('./lib/kcfnw'),
    path = require('path'),
    argv = require('yargs')
        .usage('Verwerk een netwerk-gebruik-enquete tot op het niveau dat je gebruik kunt plotten.\nUsage: $0')
        .example('$0 -t FIETS -n 247 data/enq/your-datafile.csv', 'Will process the data assuming the context of type == FIETS on network with id 247.')
        .describe('b', 'Wees blind voor netwerk-details, scan altijd de hele set')
        .alias('b', 'blind')
        .boolean('b')
        .describe('r', 'Gebruik recovery process tijdens tracing. (meer matches maar minder nauwkeurig')
        .alias('r', 'enable-recovery')
        .boolean('r')
        .describe('net', 'Het netwerk waarop het onderzoek betrekking heeft.')
        .alias('n', 'net')         //long variant
        .default('net', '126')     //default if any
        .describe('t', 'focus enkel op netwerken van dit type')
        .alias('t', 'type')
        .default('type', 'FIETS')
        .describe('output', 'Output directory to put data in.')
        .alias('o', 'output')
        .default('o', '/tmp/kcfnw')
        .describe('linkbase', 'Location of linkbase.csv to work with')
        .alias('l', 'linkbase')
        .default('linkbase', path.join(__dirname, 'data', 'base', 'linkbase.csv'))
        .describe('knoopbase', 'Location of knoopbase.csv to work with')
        .alias('k', 'knoopbase')
        .default('knoopbase', path.join(__dirname, 'data', 'base', 'knoopbase.csv'))
        .demand(1)
        .argv;

kcfnw.doWork(argv);
