TODO
====
- count usage of links in the uniquely found links

- KML generatie met layers voor hotspots, hotlinks en missing links, ev. ook rauwe gevonden traces
- hotcolor-ranges procentueel van groen-geel-rood
- voor XML: https://github.com/oozcitak/xmlbuilder-js
- voorbeeld produceren met google earth

```js
    var builder = require('xmlbuilder');
    var doc = builder.create();
    doc.begin('root')
      .ele('xmlbuilder')
        .att('for', 'node-js')
        .ele('repo')
          .att('type', 'git')
          .txt('git://github.com/oozcitak/xmlbuilder-js.git') 
        .up()
      .up()
      .ele('test')
        .txt('complete');

    console.log(doc.toString({ pretty: true }));
```

- output resultaten - meerdere sheets denormalised? meerdere KML outputs?

- aanzet voor correctie-berekening


DONE
====
- cli-switch om netwerk-type in te geven WANDEL of FIETS zodat we toch niet alles meenemen. VIA ` -t FIETS `

- cli-switch om zonder netwerkid te werken. Dt geeft meer zoekwerk, maar hopelijk meer resultaten - nadien traces trimmen op meeste netwerk-macthes.  VIA ` -b `


- alternatief: werken met koppeling start-gemeente >> newterkid zodat we buiten het standardnet kunnen zoeken voor de start  --> minder zinvol en meer data-verzamel-werk (geschrapt)

- stoeme bug gevonden waardoor we geen resultaten meer kregen

- only put NETWORK links/knopen in the base.

- analyse van de base data / netwerken --> afstand tussen knopen meten en min oplijsten
  opgelet: dubbele knopen in lijst: zelfde coordinaten, andere id, en geoid, zelfde knoopid, nodeid
  --> vanaf nu identificeren op geoid
  
- verklaring gevonden voor rare fenomeen dat er meer goede resultaten kwamen zónder netblind 
  --> oorzaak: bij netblind kan er nooit recovery zijn 
  --> om beter te kunnen vergelijken switch toegevoegd om recovery toe te laten die default AF staat!
  VIA `-r` 