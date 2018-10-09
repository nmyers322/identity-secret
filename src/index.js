const express = require('express');
const app = express();
const session = require('express-session');
const OktaJwtVerifier = require('@okta/jwt-verifier');
const cors = require('cors');
const path = require('path');
const models = require('./models');
const xss = require('xss');
const uuidv4 = require('uuid/v4');
const bodyParser = require('body-parser');
const responses = require('./responses');
const uuidValidate = require('uuid-validate');
const oktaConfig = require('./okta');

const withErrorHandler = (func, response) => {
    func().catch((err) => {
        console.log(err);
        response.status(500).send(JSON.stringify(responses.serverError()));
    });
}

const oktaJwtVerifier = new OktaJwtVerifier({
  issuer: oktaConfig.ORG_URL + '/oauth2/default',
  assertClaims: {
    cid: oktaConfig.CLIENT_ID,
  },
});

function authenticationRequired(request, response, next) {
    const authHeader = request.headers.authorization || '';
    const match = authHeader.match(/Bearer (.+)/);

    if (!match) {
        return response.status(401).end();
    }

    const accessToken = match[1];

    return oktaJwtVerifier.verifyAccessToken(accessToken)
    .then((jwt) => {
        request.jwt = jwt;
        request.userinfo = jwt.claims;
        next();
    })
    .catch((err) => {
        response.status(401).send(err.message);
    });
}

app.use(cors());
app.use(bodyParser());

// Error handling logic
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send(JSON.stringify(responses.serverError()));
});

// Create tables if they do not exist
models.createTables();

// Get list of IDs
// GET /api/v1/user
app.get('/api/v1/user', authenticationRequired, async (request, response) => {
    withErrorHandler(async () => {
        let ids = await models.user.getByUid(request.userinfo.uid);
        console.log('GET /api/v1/user', request.userinfo.uid, {ids});
        return response.status(200).send(JSON.stringify({ids}));
    }, response);
});

// Create new ID
// POST /api/v1/user
app.post('/api/v1/user', authenticationRequired, (request, response) => {
    withErrorHandler(async () => {
        let id = await models.user.create(request.userinfo.uid);
        console.log('POST /api/v1/user', request.userinfo.uid, id);
        return response.status(201).send(JSON.stringify(responses.created(id)));
    }, response);
});

// Delete an existing ID
// DELETE /api/v1/user/:id
app.delete('/api/v1/user/:id', authenticationRequired, (request, response) => {
    withErrorHandler(async () => {
        if (!request.params.id || !uuidValidate(request.params.id)) {
            return response.status(400).send(JSON.stringify(responses.badRequest("Invalid or missing ID")));
        }
        let id = xss(request.params.id);
        // Must own the id
        let verifiedOwnership = await models.user.getByIdAndUid(id, request.userinfo.uid).then(row => {
            return typeof row !== "undefined";
        });
        if (!verifiedOwnership) {
            return response.status(401).send(JSON.stringify(responses.unauthorized("Must be owner of id")))
        }
        // Delete any requests against the ID
        await models.request.getByOwner(id).then(ids => {
            ids && ids.map(async innerId => {
                await models.request.delete(innerId);
                // Notify the requester
                await models.notification.new(id, models.notification.types.request_denied, {owner: id});
            });
        });
        // Delete any requests created by the ID
        await models.request.getByRequester(id).then(ids => {
            ids && ids.map(async innerId => {
                await models.request.delete(innerId);
                // Notify the requestee
                await models.notification.new(id, models.notification.types.request_deleted, {requester: id});
            });
        });
        // Finally delete the ID
        await models.user.delete(id);
        console.log('DELETE /api/v1/user/{id}', request.userinfo.uid, id);
        return response.status(200).send(JSON.stringify(responses.ok()));
    }, response);
});

// Initiate New Request
// POST /api/v1/request 
// body: { owner: uuid of owner, claims: List of claims to request access to }
app.post('/api/v1/request', authenticationRequired, (request, response) => {
    withErrorHandler(async () => {
        console.log(request.body);
        if (!request.body || !request.body.owner || !uuidValidate(request.body.owner)) {
            return response.status(400).send(JSON.stringify(responses.badRequest("Invalid or missing parameter: owner")));
        }
        if (!request.body || !request.body.requester || !uuidValidate(request.body.requester)) {
            return response.status(400).send(JSON.stringify(responses.badRequest("Invalid or missing parameter: requester")));
        }
        if (!request.body || !request.body.attribute || typeof request.body.attribute !== "string") {
            return response.status(400).send(JSON.stringify(responses.badRequest("Invalid or missing parameter: attribute")));
        }
        let owner = xss(request.body.owner);
        let requester = xss(request.body.requester);
        let attribute = xss(request.body.attribute);
        // Requester must belong to caller
        let verifiedOwnership = await models.user.getByIdAndUid(requester, request.userinfo.uid).then(row => {
            return typeof row !== "undefined";
        });
        if (!verifiedOwnership) {
            return response.status(401).send(JSON.stringify(responses.unauthorized("Requester must own id")))
        }
        let id = await models.request.new(owner, requester, attribute);
        // Notify the requestee
        await models.notification.new(owner, models.notification.types.new_request, {requester});
        response.status(201).send(JSON.stringify(responses.created(id)));
    }, response);
}); 

// // Delete request
// // DELETE /api/v1/request/:id
// app.delete('/api/v1/request/:id', authenticationRequired, (request, response) => {
//     withErrorHandler(async () => {
//         if (!request.params.id || !uuidValidate(request.params.id)) {
//             return response.status(400).send(JSON.stringify(responses.badRequest("Invalid or missing ID")));
//         }
//         let id = xss(request.params.id);
//         let requestInfo = await models.request.get(id);
//         // Must be the requester
//         let requesterIds = await models.user.getBySub(request.userinfo.sub);
//         let foundRequester = null;
//         // Map is not the most efficient searcher...
//         requesterIds.map(requesterId => {
//             if (requesterId === requestInfo.requester) {
//                 foundRequester = requesterId;
//             }
//         });
//         if (foundRequester === null) {
//             return response.status(401).send(JSON.stringify(responses.unauthorized("User does not own the request")));
//         }
//         // Notify the requestee
//         await models.notification.new(requestInfo.owner, models.notification.types.request_deleted, {requester: foundRequester});
//         // Delete the request
//         await models.request.delete(id);
//         return response.status(200).send(JSON.stringify(responses.ok()));
//     }, response);
// });

// // Accept request
// // POST /api/v1/request/accept
// // body: { id: uuid of request }
// app.post('/api/v1/request/accept', authenticationRequired, (request, response) => {
//     withErrorHandler(async () => {
//         if (!request.body || !request.body.id || !uuidValidate(request.body.id)) {
//             return response.status(400).send(JSON.stringify(responses.badRequest("Invalid or missing ID")));
//         }
//         let id = xss(request.body.id);
//         let requestInfo = await models.request.get(id);
//         // Must be the owner
//         let ownerIds = await models.user.getBySub(request.userinfo.sub);
//         let foundOwner = null;
//         // Map is not the most efficient searcher...
//         ownerIds.map(ownerId => {
//             if (ownerId === requestInfo.owner) {
//                 foundOwner = ownerId;
//             }
//         });
//         if (foundOwner === null) {
//             return response.status(401).send(JSON.stringify(responses.unauthorized("User does not own the request")));
//         }
//         await models.request.accept(id);
//         // Notify the requester
//         let requestInfo = await models.request.get(id);
//         await models.notification.new(requestInfo.requester, models.notification.types.request_accepted, {});
//         return response.status(200).send(JSON.stringify(responses.ok()));
//     }, response);
// });

// // Deny request
// // POST /api/v1/request/deny
// // body: { id: uuid of request }
// app.post('/api/v1/request/deny', authenticationRequired, (request, response) => {
//     withErrorHandler(async () => {
//         if (!request.body || !request.body.id || !uuidValidate(request.body.id)) {
//             return response.status(400).send(JSON.stringify(responses.badRequest("Invalid or missing ID")));
//         }
//         let id = xss(request.body.id);
//         let requestInfo = await models.request.get(id);
//         // Must be the owner
//         let ownerIds = await models.user.getBySub(request.userinfo.sub);
//         let foundOwner = null;
//         // Map is not the most efficient searcher...
//         ownerIds.map(ownerId => {
//             if (ownerId === requestInfo.owner) {
//                 foundOwner = ownerId;
//             }
//         });
//         if (foundOwner === null) {
//             return response.status(401).send(JSON.stringify(responses.unauthorized("User does not own the request")));
//         }
//         await models.request.deny(id);
//         // Notify the requester
//         let requestInfo = await models.request.get(id);
//         await models.notification.new(requestInfo.requester, models.notification.types.request_accepted, {});
//         return response.status(200).send(JSON.stringify(responses.ok()));
//     }, response);
// });

// // Insert or update a new claim
// // PUT /api/v1/claim
// // body: { name text, value text, context object optional }
// app.put('/api/v1/claim', authenticationRequired, (request, response) => {
//     withErrorHandler(async () => {
//         if (!request.body || !request.body.name || typeof request.body.name !== "string") {
//             return response.status(400).send(JSON.stringify(responses.badRequest("Invalid or missing parameter: name")));
//         }
//         if (!request.body || !request.body.value || typeof request.body.value !== "string") {
//             return response.status(400).send(JSON.stringify(responses.badRequest("Invalid or missing parameter: value")));
//         }
//         let name = xss(request.body.name);
//         let value = xss(request.body.value);
//         let context = request.body.context ? request.body.context : {};
//         if (typeof context !== "object") {
//             return response.status(400).send(JSON.stringify(responses.badRequest("Invalid parameter: context")));
//         }
//         await models.claim.new(request.userinfo.sub, name, value, context);
//     }, response);
// });

// // Delete a claim
// // DELETE /api/v1/claim/:id
// api.delete('/api/v1/claim/:id', authenticationRequired, (request, response) => {
//     withErrorHandler(async () => {
//         if (!request.params.id || !uuidValidate(request.params.id)) {
//             return response.status(400).send(JSON.stringify(responses.badRequest("Invalid or missing ID")));
//         }
//         let id = xss(request.params.id);
//         let claimInfo = await models.claim.get(id);
//         if (claimInfo.owner !== request.userinfo.sub) {
//             return response.status(401).send(JSON.stringify(responses.unauthorized("Must be the claim owner")));
//         }
//         await models.claim.delete(id);
//         return response.status(200).send(JSON.stringify(responses.ok()));
//     }, response);
// });

// // Get your own claims
// // GET /api/v1/claim
// api.get('/api/v1/claim', authenticationRequired, (request, response) => {
//     withErrorHandler(async () => {
//         let claims = await.models.claim.getByOwner(request.userinfo.sub);
//         return response.status(200).send(JSON.stringify({claims}));
//     }, response);
// });

// // Get someone else's claims
// // GET /api/v1/claim/owner/id
// api.get('/api/v1/claim/owner/:id', authenticationRequired, (request, response) => {
//     withErrorHandler(async () => {
//         if (!request.params.id || !uuidValidate(request.params.id)) {
//             return response.status(400).send(JSON.stringify(responses.badRequest("Invalid or missing ID")));
//         }
//         let id = xss(request.params.id);
//         let requests = await models.request.getByOwner(id);
//         let requesterIds = await models.user.getBySub(request.userinfo.sub);
//         let allowedClaims = new Set([]);
//         requests.map((requestInfo) => {
//             requesterIds.map((requesterId) => {
//                 if (requestInfo.requester === requesterId && requestInfo.accepted === true) {
//                     JSON.parse(requestInfo.claims).map((claim) => {
//                         allowedClaims.add(claim);
//                     });
//                 }
//             });
//         });
//         if (allowedClaims.size > 0) {
//             let ownerInfo = await models.user.get(id);
//             let claims = await models.claim.getByOwner(ownerInfo.sub);
//             let filteredClaims = claims.filter((claim) => {
//                 allowedClaims.has(claim.name);
//             });
//             return response.status(200).send(JSON.stringify({claims: filteredClaims}));
//         }
//         return response.status(401).send(JSON.stringify(responses.unauthorized("Owner must have accepted request for at least one claim")));
//     }, response);
// });

// Main route
app.get('/', (request, response) => {
    if (request.userinfo) {
        return response.send(`Hi ${request.userinfo.name}!`);
    } else {
        return response.send('Hi!');
    }
});

app.listen(8080, () => console.log(`Server started and listening on port 8080`));
