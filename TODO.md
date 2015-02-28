TODO
====

- aanzet voor correctie-berekening: hoe nummering van netwerk verbeteren (zo goedkoop mogelijk)

knoopchecks
- laat toe om de cutt-off mee te geven --> laatste existing --> alle new daaronder == probleem
- check the gap --> zijn alle codes aangesloten of zijn er ontbrekende?
linkchecks
- check if link start-stop knoopid match the start-stop code
- check if link (geo) is in the rectangle of de connecting nodes! --> tollerance?


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
  
- count usage of links in the uniquely found links --> ResultSet object

- KML output uit de scope gehaald --> ArcGis blijkt dit snel en voorbeeldig aan te pakken

- nice output of all sets to csv files