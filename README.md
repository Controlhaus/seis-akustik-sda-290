# FSR FLEX-LT
Controls FSR FLEX-LT via TCP.  

## Usage  
```git clone https://github.com/Controlhaus/fsr-flex-lt```   
```cd fsr-flex-lt```  
```npm install```  
```node main.js --ipAddress IpAddressOfYourDevice --serviceName OptionalName```

## CLI Commands
The following commands are available from the command line:  
  
```connect``` Starts the TCP connection.  
  
```close``` Closes the TCP connection.  
  
```beep``` Send beep command.  

See catch-connect-service.json for a complete list of commands and responses.   