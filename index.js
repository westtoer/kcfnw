var kcfnw=require('./lib/kcfnw')
  , path = require('path')
  , argv = require('yargs')
    .usage('Verwerk een netwerk-gebruik-enquete tot op het niveau dat je gebruik kunt plotten.\nUsage: $0')
    .example('$0 -n 247', 'TODO describe what this example does.')
    .describe('net', 'Het netwerk waarop het onderzoek betrekking heeft.')
    .alias('n', 'net')         //long variant
    .default('net', '126')     //default if any
    .describe('work', 'Working directory to put data in.')
    .alias('w', 'work')       
    .default('work', '/tmp/kcfnw')
    .describe('linkbase', 'Location of linkbase.csv to work with')
    .alias('l','linkbase')
    .default('linkbase', path.join(__dirname, 'data', 'base', 'linkbase.csv'))
    .describe('knoopbase', 'Location of knoopbase.csv to work with')
    .alias('k','knoopbase')
    .default('knoopbase', path.join(__dirname, 'data', 'base', 'knoopbase.csv'))
    .demand('n')
    .argv
;

kcfnw.process(argv);
