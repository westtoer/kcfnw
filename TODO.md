TODO
====

- analyse van de base data / netwerken --> afstand tussen knopen bv


- cli-switch voor verbose error reporting
- meer fouten traceren en produceren om te kunnen nakijken waarom zo weinig traces overblijven

- traceren van gemiste links (nu worden die nog gewoon weggegooid)
- counts van gebruikte knopen
- counts van gebruikte links
- afstanden tussen knopen van zelfde nummer --> vooral minimum

- pure data - output resultaten - meerdere sheets denormalised?

- KML generatie met layers voor hotspots, hotlinks en missing links, ev. ook rauwe gevonden traces
- hotcolor-ranges procentueel van groen-geel-rood
- voor XML: https://github.com/oozcitak/xmlbuilder-js
- voorbeeld produceren met google earth

DONE
====
- cli-switch om netwerk-type in te geven WANDEL of FIETS zodat we toch niet alles meenemen. VIA ` -t FIETS `

- cli-switch om zonder netwerkid te werken. Dt geeft meer zoekwerk, maar hopelijk meer resultaten - nadien traces trimmen op meeste netwerk-macthes.  VIA ` -b `


- alternatief: werken met koppeling start-gemeente >> newterkid zodat we buiten het standardnet kunnen zoeken voor de start  --> minder zinvol en meer data-verzamel-werk (geschrapt)

- stoeme bug gevonden waardoor we geen resultaten meer kregen

- only put NETWORK links/knopen in the base.
