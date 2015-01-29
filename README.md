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
* -w: working directory for data (default /tmp/kcfnw)  --work {path-to-directory}
* -l: linkbase location (default ./data/base/linkbase.csv) --linkbase {path-to-linkbase.csv}
* -k: knoopbase location (default ./data/base/knoopbase.csv) --knoopbase {path-to-knoopbase.csv}
* argument: questionaire data location (required argument) {path-to-data-of-questionaire}