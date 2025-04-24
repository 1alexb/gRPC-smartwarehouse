Smart Warehouse System

This project is a full stack distributed system that manages a warehouse, using gRPC and a web interface. It can handle inventory, robot an order operations and has a fully functional chat for the users.

It is implemented using node.js with gRPC for the communication between the services. The frontend uses Express/EJS and security enforced via API auth.

Install all dependecies using npm install and then start each service from it's folder. The web client is available on localhost:3000

The services include inventory tracking, robot updates, a order processing system and a chat in a separate module. They all defined in their respective proto files and use different communication styles.

It also includes error handling, input validation and user feedback. The GUI supports all the major features of the console.

The codebase is structured and documented, having a separate server, client, web client, test and log folder.
