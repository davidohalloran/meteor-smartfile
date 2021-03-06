var FormData = Npm.require('form-data');
var formDataSubmitSync = Meteor._wrapAsync(FormData.prototype.submit);

var SF_API_ENDPOINT = "app.smartfile.com";
var SF_API_PATH = "/api/2/";
var SF_API_URL = "https://" + SF_API_ENDPOINT + SF_API_PATH;

var apiAuthString;
var basePath;

SmartFile.configure = function (params) {
    if (params.key && params.password) {
        apiAuthString = params.key + ":" + params.password;
    }

    basePath = params.basePath || basePath || "";
    SmartFile.publicRootUrl = params.publicRootUrl || SmartFile.publicRootUrl;
};

Meteor.startup(function() {
    if (!apiAuthString) {
        console.log("Warning, SmartFile package is not configured");
    }
});

SmartFile.allow = function(){ return true; };

SmartFile.onUpload = function(){ };
SmartFile.onUploadFail = function(){ };

SmartFile.mkdir = function (path) {
    try {
        var url = SF_API_URL + "/path/oper/mkdir/";

        HTTP.post(url, {
            auth: apiAuthString,
            data: {path: resolvePath(path)}
        });
    } catch (e){
        throw makeSFError(e.response.statusCode);
    }
};

SmartFile.ls = function (path) {
    try {
        var url = SF_API_URL + "/path/info/" + resolvePath(path) + "?children=true";

        var result = HTTP.get(url, {
            auth: apiAuthString
        });

        return result.data;
    } catch (e){
        throw makeSFError(e.response.statusCode);
    }
};

SmartFile.save = function (data, options) {
    var path = options.path || "";
    var fileName = options.fileName || "upload-" + Date.now();

    var form = new FormData();
    form.append("file", data, {
        filename: fileName
    });

    var uploadPath = SF_API_PATH + "path/data/" + resolvePath(path);

    var res = formDataSubmitSync.call(form, {
        protocol: "https:",
        host: SF_API_ENDPOINT,
        path: uploadPath,
        auth: apiAuthString
    });

    if (res.statusCode !== 200) {
        throw makeSFError(res.statusCode);
    }

    var returnValue = {};
    returnValue.statusCode = res.statusCode;
    returnValue.path = path + "/" + fileName;

    return returnValue;
};

SmartFile.onIncomingFile = function (data, options) {
    return SmartFile.save(data, options);
};

Meteor.methods({
    "sm.upload": function (data, options) {
        var allowed = SmartFile.allow.call(this, options);

        if (!allowed) {
            throw new Meteor.Error(403, "Upload not allowed");
        }

        try {
            var result = SmartFile.onIncomingFile(new Buffer(data), options);
            SmartFile.onUpload.call(this, result, options);
            return result;
        } catch (e){
            //Handle only SF related errors
            if (e.statusCode) {
                SmartFile.onUploadFail.call(this, result, options);
                throw new Meteor.Error(500, e.message);
            }
            else {
                throw e;
            }
        }
    }
});

function makeSFError (statusCode) {
    var error = new Error("SmartFile API returned status code " + statusCode);
    error.statusCode = statusCode;
    return error;
}

function resolvePath (path) {
    return basePath + "/" + path;
}
