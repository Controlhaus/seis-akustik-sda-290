# Seis Akustik SDA-290
Controls Seis Akustik SDA-290 via TCP.  

## Usage  
```git clone https://github.com/Controlhaus/seis-akustik-sda-290```   
```cd seis-akustik-sda-290```  
```npm install```  
```node main.js --ipAddress IpAddressOfYourDevice --serviceName OptionalName```

### Start Parameters
- ```serviceName``` A prefix for log messages. Default: ```SDA290```
- ```ipAddress``` The host address or url to connect to.
- ```port``` The tcp port to connect to. Default: ```23```
- ```heartbeatInterval``` The interval between sending heartbeat messages in milliseconds. The heartbeat is used to detect unexpected disconnects and automatically reconnect. Default: ```10000```

## CLI Commands
The following commands are available from the command line:  
  
```connect``` Starts the TCP connection.  
  
```close``` Closes the TCP connection.  
  
See catch-connect-service.json for a complete list of commands and responses.   