const uuidv4 = require('uuid/v4');
const xss = require('xss');
const path = require('path');
const sqlite = require('sqlite');
const Promise = require('bluebird');

const dbPromise = sqlite.open(path.join(__dirname, '..', 'db', 'database.db'), { Promise });

let handleError = (err) => {
    if (err) {
        console.log(err.message);
        throw err;
    }
}

// Create tables if they do not exist
exports.createTables = async () => {
    const db = await dbPromise;
    await db.all("SELECT COUNT(*) FROM sqlite_master WHERE type = \"table\" AND name = \"user\";")
        .then((rows) => {
            if (rows[0]['COUNT(*)'] < 1) {
                db.run('CREATE TABLE user(id text PRIMARY KEY, uid text, name text);');
                console.log("Created user table");
            } else {
                console.log("Table user exists");
            }
        })
        .catch((err) => {
            console.log("Error selecting table user from sqlite_master");
            throw err;
        });
    await db.all("SELECT COUNT(*) FROM sqlite_master WHERE type = \"table\" AND name = \"request\";")
        .then((rows) => {
            if (rows[0]['COUNT(*)'] < 1) {
                db.run('CREATE TABLE request(id text PRIMARY KEY, owner text, requester text, datetime numeric, claims text, accepted numeric);');
                console.log("Created request table");
            } else {
                console.log("Table request exists");
            }
        })
        .catch((err) => {
            console.log("Error selecting table request from sqlite_master");
            throw err;
        });
    await db.all("SELECT COUNT(*) FROM sqlite_master WHERE type = \"table\" AND name = \"claim\";")
        .then((rows) => {
            if (rows[0]['COUNT(*)'] < 1) {
                db.run('CREATE TABLE claim(id text PRIMARY KEY, owner text, name text, value text, datetime numeric, context text);');
                console.log("Created claim table");
            } else {
                console.log("Table claim exists");
            }
        })
        .catch((err) => {
            console.log("Error selecting table claim from sqlite_master");
            throw err;
        });
    await db.all("SELECT COUNT(*) FROM sqlite_master WHERE type = \"table\" AND name = \"notification\";")
        .then((rows) => {
            if (rows[0]['COUNT(*)'] < 1) {
                db.run('CREATE TABLE notification(id text PRIMARY KEY, owner text, type text, context text, read numeric, datetime numeric);');
                console.log("Created notification table");
            } else {
                console.log("Table notification exists");
            }
        })
        .catch((err) => {
            console.log("Error selecting table notification from sqlite_master");
            throw err;
        });
};

exports.user = {
    create: async (uid) => {
        let db = await dbPromise;
        let id = uuidv4();
        uid = xss(uid);
        await db.run(`INSERT INTO user(id, uid) VALUES("${id}", "${uid}");`)
            .then(() => {
                console.log(`Inserted user: ${id}, ${uid}`);
            }).catch((err) => {
                handleError(err);
            });
        return id;
    },
    delete: async (id) => {
        let db = await dbPromise;
        id = xss(id);
        await db.run(`DELETE FROM user WHERE id="${id}";`)
            .then(() => {
                console.log(`Deleted user id: ${id}`);
            })
            .catch((err) => {
                handleError(err);
            });
    },
    getByUid: async (uid) => {
        let db = await dbPromise;
        uid = xss(uid);
        return await db.all(`SELECT * FROM user WHERE uid=\"${uid}\";`)
            .then((result) => {
                return result.map((row) => row.id);
            })
            .catch((err, rows) => {
                handleError(err);
            });
    },
    getByIdAndUid: async (id, uid) => {
        let db = await dbPromise;
        id = xss(id);
        uid = xss(uid);
        return await db.get(`SELECT * FROM user WHERE uid=\"${uid}\" AND id=\"${id}\";`)
            .then((result) => {
                return result;
            })
            .catch((err, rows) => {
                handleError(err);
            });
    },
    updateName: async (id, name) => {
        let db = await dbPromise;
        name = xss(name);
        return await db.run(`UPDATE user SET name="${name}" WHERE id="${id}";`)
            .then(() => {
                console.log(`Updated user to name=${name}: ${id}`);
            })
            .catch((err) => {
                handleError(err);
            });
    }
}

exports.request = {
    accept: async (id) => {
        let db = await dbPromise;
        id = xss(id);
        await db.run(`UPDATE request SET accepted=true WHERE id="${id}";`)
            .then(() => {
                console.log(`Updated request to accept=true: ${id}`);
            })
            .catch((err) => {
                handleError(err);
            });
    },
    delete: async (id) => {
        let db = await dbPromise;
        id = xss(id);
        await db.run(`DELETE FROM request WHERE id="${id}";`)
            .then(() => {
                console.log(`Deleted request: ${id}`);
            })
            .catch((err) => {
                handleError(err);
            });
    },
    get: async (id) => {
        let db = await dbPromise;
        return await db.get(`SELECT * FROM request WHERE id="${id}";`)
            .then((row) => {
                return row;
            })
            .catch((err) => {
                handleError(err);
            });
    },
    getByOwner: async (owner) => {
        let db = await dbPromise;
        return await db.all(`SELECT * FROM request WHERE owner="${owner}";`)
            .then((rows) => {
                return rows.map((row) => (row.id));
            })
            .catch((err) =>{
                handleError(err);
            });
    },
    getByRequester: async (requester) => {
        let db = await dbPromise;
        await db.all(`SELECT * FROM request WHERE requester="${requester}";`)
            .then((rows) => {
                return rows.map((row) => (row.id));
            })
            .catch((err) =>{
                handleError(err);
            });
    },
    new: async (owner, requester, claims) => {
        let db = await dbPromise;
        let id = uuidv4();
        owner = xss(owner);
        claims = JSON.stringify(claims);
        let datetime = Date.now();
        await db.run(`INSERT INTO request(id, owner, requester, datetime, claims, accepted) VALUES("${id}", "${owner}", "${requester}", "${datetime}", "${claims}", false);`) 
            .then(() => {
                console.log(`Inserted request: ${id}, ${owner}, ${requester}, ${datetime}, ${claims}, ${accepted}`);
            })
            .catch((err) => {
                handleError(err);
            });
    }
}

exports.claim = {
    delete: async (id) => {
        let db = await dbPromise;
        id = xss(id);
        await db.run(`DELETE FROM claim WHERE id="${id}";`) 
            .then(() => {
                console.log(`Deleted claim: ${id}`);
            })
            .catch((err) => {
                handleError(err);
            });
    },
    get: async (id) => {
        let db = await dbPromise;
        return await db.get(`SELECT * FROM claim WHERE id="${id}";`)
            .then((row) => {
                return row;
            })
            .catch((err) => {
                handleError(err);
            });
    },
    getByOwner: async (owner) => {
        let db = await dbPromise;
        return await db.all(`SELECT * FROM claim WHERE owner="${owner}";`)
            .then((rows) => {
                return rows;
            })
            .catch((err) => {
                handleError(err);
            });
    },
    put: async (owner, name, value, context) => {
        let db = await dbPromise;
        let id = uuidv4();
        name = xss(name);
        value = xss(name);
        if (!context) {
            context = {};
        }
        let contextString = JSON.stringify(context);
        let datetime = Date.now();
        await db.get(`SELECT id FROM claim WHERE owner="${owner}" AND name="${name}";`)
            .then(async (row) => {
                if (typeof row === "undefined") {
                    await db.run(`INSERT INTO claim(id, owner, name, value, datetime, context) VALUES("${id}", "${owner}", "${name}", "${value}", "${datetime}", "${contextString}");`) 
                        .then(() => {
                            console.log(`Inserted claim: ${id}, ${owner}, ${name}, ${value}, ${datetime}, ${contextString}`);
                        })
                        .catch((err) => {
                            handleError(err);
                        });
                } else {
                    await db.run(`UPDATE claim SET owner="${owner}", name="${name}", value="${value}", datetime="${datetime}", context="${contextString}" WHERE id="${row.id}");`) 
                        .then(() => {
                            console.log(`Updated claim: ${id}, ${owner}, ${name}, ${value}, ${datetime}, ${contextString}`);
                        })
                        .catch((err) => {
                            handleError(err);
                        });
                }
            })
            .catch((err) => {
                handleError(err);
            });
    }
}

exports.notification = {
    get: async (owner) => {
        let db = await dbPromise;
        return await db.all(`SELECT * FROM notification WHERE owner="${owner}";`)
            .then((rows) => {
                return rows;
            })
            .catch((err) => {
                handleError(err);
            });
    },
    new: async (owner, type, context) => {
        let db = await dbPromise;
        let id = uuidv4();
        let datetime = Date.now();
        if (!context) {
            context = {};
        }
        let contextString = JSON.stringify(context);
        await db.run(`INSERT INTO notification(id, owner, type, context, read, datetime) VALUES("${id}", "${owner}", "${type}", "${contextString}", false, "${datetime}")`)
            .then(() => {
                console.log(`Inserted notification: ${id}, ${owner}, ${type}, ${contextString}, ${datetime}`);
            })
            .catch((err) => {
                handleError(err);
            });
    },
    markRead: async (id) => {
        let db = await dbPromise;
        await db.run(`UPDATE notification SET read=true WHERE id="${id}";`)
            .then(() => {
                console.log(`Marked notification as read: ${id}`);
            })
            .catch((err) => {
                handleError(err);
            });
    },
    types: {
        new_request: "NEW_REQUEST",
        request_accepted: "REQUEST_ACCEPTED",
        request_deleted: "REQUEST_DELETED",
        request_denied: "REQUEST_DENIED"
    }
}