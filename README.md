#About
Mini project voor de statistische analyse van fnw-enquetes

#Usage
## required input data
###knoopbase
csv format file to the data of the knopen in the network

###linkbase
csv format file to the data of the links in the network

###enquete data
csv format file to the data of the obtained questionaires to be processed


## example
nodejs input -t FIETS -n 247 data/enq/your-datafile.csv

This will process the data assuming the context:
* type == FIETS 
* on network with id 247
* location of the data of the questionaire is in data/enq/your-datafile.csv

## switches
* -b: ignore specific network id (be blind for network focus) --blind
* -t: type of network (default FIETS) --type  {FIETS|WANDEL}
* -r: laat recovery toe in de positionering (default off) --enable-recovery
* -n: network id (default 126) --net {networkid}
* -o: output directory for data (default /tmp/kcfnw)  --output {path-to-directory}
* -l: linkbase location (default ./data/base/linkbase.csv) --linkbase {path-to-linkbase.csv}
* -k: knoopbase location (default ./data/base/knoopbase.csv) --knoopbase {path-to-knoopbase.csv}
* argument: questionaire data location (required argument) {path-to-data-of-questionaire}

#How this works
* Base data is read from csv. This is building up the network-graph from the knoopbase and linkbase files
* Lijn-data is read from the questionaire csv file and then processed line per line. This processing takes these steps:
    * positioning: try to match the sequence of followed knopen to 
    * counting: 
        * for the found matching traces with unique results we actually count link by link its presence in the questionaire
        * additionally we calculate the statistics of 
    * output set: csv output of the found counts and stats
        * base analysis
            * base-usage-links.csv double usage of link-nrs --> count per unique id of each
            * base-usage-knopen.csv usage of knopen-nrs, adding min-dist and location between double used knopen
        * questionaire results
            * result-overview.csv: metadata of lines processed, traces found etc etc
            * result-lines.csv: line by line - count of links and accumulated distance
            * result-traveled-links.csv: link by link - count of usage (leaving out the zero's)
    * plotting: the datasets on the map (kml for each csv described)