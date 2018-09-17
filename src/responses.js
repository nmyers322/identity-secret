exports.serverError = () => ({
    type: "ERROR",
    msg: "Internal server error",
    status: 500
});

exports.badRequest = (msg) => ({
    type: "ERROR",
    msg,
    status: 400
});

exports.created = (id) => ({
    type: "CREATED",
    id,
    status: 201
});

exports.ok = () => ({
    type: "SUCCESS",
    msg: "OK",
    status: 200
});

exports.unauthorized = (msg) => ({
    type: "ERROR",
    msg,
    status: 401
});