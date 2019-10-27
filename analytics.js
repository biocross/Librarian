const https = require('https');

// These analytics ONLY send event names for understanding usage of the librarian.
// Absolutely NO system metadata or personal information is ever collected or sent.

///// Simple, Privary Aware Analytics: https://curl.press

const sendEvent = async (event) => {
    if (event && event.length && event.length > 0) {
        try {
            const req = https.get(`https://curl.press/api/librarian/add?event=${event}`).on('error', function(err) {})     
        } catch (error) {}
    }
}

const LibrarianEvents = {
    SetupStarted: "setup.start",
    SetupComplete: "setup.finish",
    SetupError: "setup.error",
    ServerStarted: "server.start",
    ServerError: "server.error",
    BuildSubmitted: "build.submit"
}

module.exports = { sendEvent, LibrarianEvents };