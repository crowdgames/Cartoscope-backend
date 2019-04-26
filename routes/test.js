/**
 * Created by kiprasad on 07/09/16.
 */
var express = require('express');
var router = express.Router();
var multer = require('multer');
var validator = require('validator');
var http = require('http');
var url = require('url');
var mailer = require('../scripts/mailer');
var path = require('path');
var fs = require('fs');
var d3 = require("d3");
var tar = require('tar-fs');
var randomString = require('randomstring');
var downloadStatus = require('../db/downloadStatus');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;

var unzip = require('unzip');
var Minizip = require('node-minizip');
var mv = require('mv');


var Promise = require('bluebird');
var filters = require('../constants/filters');
var imageCompressionLibWithExif = require('../scripts/imageCompressionWithExif');
var imageCompressionLibNoExif = require('../scripts/imageCompression');

// var upload = multer({dest: 'uploads/'});
var projectDB = require('../db/project');
var ncp = require('ncp').ncp;
ncp.limit = 16;

var email = process.env.CARTO_MAILER;

var tarStream = require('tar-stream');



const storage = multer.diskStorage({
    destination: function (req, file, cb) {


        console.log("in storage disk")

        var path_to_store = path.join(__dirname, '../', 'temp');
        cb(null, path_to_store)
    },
    filename: function (req, file, cb) {
        console.log(file)
        var extArray = file.originalname.split(".");
        var extension = extArray[extArray.length - 1];
        cb(null, file.fieldname + '_' + Date.now()+ '.' +extension)
    }
})
const fupload = multer({ storage: storage });



router.post('/upload',  [filters.requireLogin, filters.requiredParamHandler(['file', 'projectID'])],
  function(req, res, next) {
    var body = req.body;
    // if('name' in body && 'desc' in body)
    if (validator.isURL(body.file)) {
      var parsedURl = url.parse(body.file);
      var options = {
        host: parsedURl.hostname,
        port: parsedURl.port,
        path: parsedURl.path,
        method: 'head'
      };

      //console.log('options ', options);

      assignDownloadID(function(downloadID) {

        var rq = http.request(options, function(rr) {
          var contentType = rr.headers['content-type'];
          console.log(rr.headers);
          console.log('header status code ', rr.statusCode);

          // console.log('rr ', rr);
          if (rr.statusCode == 500) {
            res.status(500).send('{error:\'The location specified does not exist\'}');
            return;
          }

          if (contentType && contentType.search('application/zip') != -1 ||
            contentType.search('application/x-tar') != -1) {
            res.send({
              uniqueCode: downloadID
            });
            // status queued
            downloadStatus.setStatus(downloadID, 0, function(err, res) {
            });

            download2(body.file, downloadID, req.body.projectID);

          }else if(options.host == 'www.dropbox.com'){
              console.log('in dropBox');
              res.send({
                  uniqueCode: downloadID
              });
              // status queued
              downloadStatus.setStatus(downloadID, 0, function(err, res) {
              });
              downloadDrop(body.file, downloadID, req.body.projectID);


          } else {
            res.send({
              uniqueCode: downloadID,
              'recursive': true
            });
            downloadRec(body.file, downloadID, req.body.projectID, body.regex || '');
          }
        });

        rq.on('error', function(err) {
          res.status(500).send({
            error: 'Couldn\'t reach the URL'
          });
        });

        rq.end();
      });
    } else {
      res.status(500).send({
        error: 'Not a valid url'
      });
    }
  });


//filters.requireLogin
router.post('/uploadLocal', fupload.single('file'),
    function(req, res, next) {

        var main_project_id = req.body.projectID;
        var ar_ready = req.body.ar_ready;

            assignDownloadID(function (downloadID) {

                //proceed to analyze the folder
                console.log(req.file)
                var stored_filename = req.file.path;
                console.log(stored_filename)
                downloadLocal(stored_filename, downloadID, main_project_id,ar_ready);
                res.send({
                    uniqueCode: downloadID
                });
            })
    })



//filters.requireLogin
router.post('/uploadNGS', fupload.single('file'),
    function(req, res, next) {


        var map_link = req.body.map_link;

        assignDownloadID(function (downloadID) {
            //proceed to analyze the folder
            var stored_filename = req.file.path;
            downloadNGS(stored_filename,downloadID, req.body.projectID,map_link);
            res.send({
                uniqueCode: downloadID
            });
        })

    });



function downloadLocal(loc,downloadID, projectID,ar_ready) {
    projectDB.addDataSetID(projectID, downloadID).then(function() {
        // Status starting Download
        downloadStatus.setStatus(downloadID, 1, function(err, res) {

        });

        var downloadDir = 'temp/';
        var datasetDir = 'dataset/';

        console.log("In download Local:" + downloadID)

        // status downloaded
        downloadStatus.setStatus(downloadID, 2, function(err, res) {
        });

                var dirName = 'dataset/' + downloadID;

                if (!fs.existsSync(dirName)) {
                    fs.mkdirSync(dirName);
                }

                var filename = loc;
                var type = filename.substr(filename.lastIndexOf('.'));
                console.log(type);


                if (type == '.gz' || type == '.tar' ) {
                    console.log('TAR FILE');

                    var tarFile = filename;
                    console.log("Will untar")

                    // status started unzipping
                    downloadStatus.setStatus(downloadID, 3, function(err, res) {
                    });
                    //var untar = spawn('tar', ['-xvf', tarFile, '-C', dirName + '/.','--strip-components=1']);

                    fs.createReadStream(tarFile).pipe(tar.extract(dirName, {
                        ignore: function(name) {
                            var allowed_extensions = ['.jpg','.png']
                            var c_ext = path.extname(name);
                            return allowed_extensions.indexOf(c_ext) == -1 // ignore everything but images
                        },
                        strip:1})
                        .on('error', function (err) {
                            console.error('ERROR', err);
                        })
                        .on('finish', function (code) {
                            //finish: function(code) {
                            console.log("Finished");
                            readDataSetFiles(dirName, downloadID).then(imageCompressionLibWithExif.processData).then(function (data) {
                                console.log('data in read files', data);
                                projectDB.createDataSetTable(downloadID).then(function (d) {
                                    var pArr = [];
                                    for (var i in data) {
                                        var name = i;
                                        var x = data[i].x;
                                        var y = data[i].y;

                                        if (!isNaN(x) && !isNaN(y)) {
                                            var p = projectDB.createDataSetItem(downloadID, name, x, y);
                                            //catch and print error but do not cause problem
                                            p.catch(function (err) {
                                                console.log(err)
                                            });
                                            pArr.push(p);
                                        }
                                    }

                                    Promise.all(pArr).then(function (data) {
                                        //mailer.mailer(email, 'done', '<b> Done downloading file ' + filename + ' </b>');
                                        console.log("Done downloading file");

                                        //delete original compressed file (keep if ar ready)
                                        if (!ar_ready){
                                            fs.unlink(loc, (err) => {
                                                if (err) throw err;
                                                console.log('Compressed file was deleted');
                                            });
                                        }




                                        downloadStatus.setStatus(downloadID, 4, function (err, res) {
                                        });
                                    });
                                });
                            }).catch(function (err) {
                                //mailer.mailer(email, 'done', '<b> Error downloading file ' + filename + ' </b>');
                                console.log(err)
                                console.log("Error downloading file");
                                downloadStatus.setStatus(downloadID, 4, function (err, res) {
                                });
                            });

                            //}
                        //}))
                    }))


                } else if (type == '.zip') {
                    console.log('ZIP FILE');

                    //var zip = 'temp/' + downloadID+ '/' + loc;
                    var zip = loc;

                    console.log(loc);

                    fs.chmod(zip, 0755, function(err){
                        if(err) throw err;
                    });

                    // status started unzipping
                    downloadStatus.setStatus(downloadID, 3, function(err, res) {
                    });

                    // var un = fs.createReadStream(zip).pipe(unzip.Extract({ path: dirName+"/"+downloadID }));

                    Minizip.unzip(zip, dirName, function(err) {
                        if (err)
                            console.log(err);
                        else
                            console.log('unzip successfully.');

                        //unzip will require moving everything from the resulting folder to parent folder

                        console.log(zip);
                        console.log(dirName);

                        // mv('source/dir', 'dest/a/b/c/dir', {mkdirp: true}, function(err) {
                        //
                        // });


                            readDataSetFiles(dirName, downloadID).then(imageCompressionLibWithExif.processData).then(function(data) {
                            console.log('data in read files', data);
                            projectDB.createDataSetTable(downloadID).then(function(d) {
                                var pArr = [];
                                for (var i in data) {
                                    var name = i;
                                    var x = data[i].x;
                                    var y = data[i].y;

                                    //make sure we don't try to add entry with issues

                                    if (!isNaN(x) && !isNaN(y)) {
                                        var p = projectDB.createDataSetItem(downloadID, name, x, y);
                                        p.catch(function(err) {
                                            return null;
                                        });
                                        pArr.push(p);
                                    }
                                }

                                Promise.all(pArr).then(function(data) {

                                    //keep zip file if ar ready, we'll need to serve it
                                    if (!ar_ready) {

                                        fs.unlink(zip, (err) => {
                                            if (err) throw err;
                                            console.log('Compressed file was deleted');
                                        });

                                    } else {

                                        new_zip = path.join(path.dirname(zip),downloadID + ".zip") ;

                                        //rename zip folder from file_xxxx.zip to dataset_id.zip
                                        fs.rename(zip, new_zip, function(err) {
                                            if ( err ) console.log('ERROR: ' + err);
                                        });

                                    }

                                    downloadStatus.setStatus(downloadID, 4, function(err, res) {
                                    });
                                });
                            });
                        }).catch(function(err) {
                            downloadStatus.setStatus(downloadID, 4, function(err, res) {
                            });
                        });
                    });

                }


    });
}


function downloadNGS(loc,downloadID, projectID,map_link) {
    console.log('In Download NGS');
    projectDB.addDataSetID(projectID, downloadID).then(function() {
        // Status starting Download
        downloadStatus.setStatus(downloadID, 1, function(err, res) {

        });

        var downloadDir = 'temp/';
        var datasetDir = 'dataset/';

        console.log("In download Local:" + downloadID)


        downloadStatus.setStatus(downloadID, 2, function(err, res) {
        });

        var dirName = 'dataset/' + downloadID;


        if (!fs.existsSync(dirName)) {
            fs.mkdirSync(dirName);
        };

        var filename = loc;
        var type = filename.substr(filename.lastIndexOf('.'));
        console.log(type);

        if (type == '.gz' || type == '.tar') {
            console.log('TAR FILE');

            var tarFile = filename;
            console.log("Will untar");
            console.log(loc)

            // status started unzipping
            downloadStatus.setStatus(downloadID, 3, function(err, res) {
            });

            fs.createReadStream(loc).pipe(tar.extract(dirName, {
                ignore: function(name) {
                    var allowed_extensions = ['.csv'];
                    var c_ext = path.extname(name);
                    return allowed_extensions.indexOf(c_ext) == -1 // ignore everything but csvs
                },
                strip:1
                })
                .on('error', function (err) {
                    console.error('ERROR', err);
                })
                .on('finish', function (code) {
                    readDataSetFiles(dirName, downloadID).then(readCSVs).then(function(data) {
                        projectDB.createDataSetTable(downloadID).then(function(d) {
                            var pArr = [];
                            for (var i in data) {
                                var name = i;
                                var x = data[i].x;
                                var y = data[i].y;
                                //make sure we don't accidentaly add NAs
                                if (!isNaN(x) && !isNaN(y)) {
                                    var p = projectDB.createDataSetItem(downloadID, name, x, y);
                                    p.catch(function(err) {
                                        return null;
                                    });
                                    pArr.push(p);
                                }

                            }

                            Promise.all(pArr).then(function(data) {
                                //mailer.mailer(email, 'done', '<b> Done downloading file ' + filename + ' </b>');
                                console.log("Done downloading file");

                                fs.unlink(loc, (err) => {
                                    if (err) throw err;
                                    console.log('Compressed file was deleted');
                                });

                                downloadStatus.setStatus(downloadID, 4, function(err, res) {
                                    //Change image source here
                                    projectDB.updateImageSource(projectID,map_link).then(function(d){
                                        console.log("Map Link updated")
                                    })
                                });
                            });
                        });
                    }).catch(function(err) {
                       console.log("Error downloading file");
                        console.log(err);
                        downloadStatus.setStatus(downloadID, 4, function(err, res) {
                        });
                    });

                }));

        } else if (type == '.zip') {
            console.log('ZIP FILE');

            var zip = loc;

            fs.chmod(zip, 0755, function(err){
                if(err) throw err;
            });

            // status started unzipping
            downloadStatus.setStatus(downloadID, 3, function(err, res) {
            });

            // var un = fs.createReadStream(zip).pipe(unzip.Extract({ path: dirName+"/"+downloadID }));
            console.log(zip, dirName);

            Minizip.unzip(zip, dirName, function(err) {
                if (err)
                    console.log(err);
                else
                    console.log('unzip successfully.');

                readDataSetFiles(dirName, downloadID).then(readCSVs).then(function(data) {
                    console.log('data in read files', data);
                    projectDB.createDataSetTable(downloadID).then(function(d) {
                        var pArr = [];
                        for (var i in data) {
                            var name = i;
                            var x = data[i].x;
                            var y = data[i].y;
                            if (!isNaN(x) && !isNaN(y)) {
                                var p = projectDB.createDataSetItem(downloadID, name, x, y);
                                p.catch(function(err) {
                                    return null;
                                });
                                pArr.push(p);
                            }

                        }

                        Promise.all(pArr).then(function(data) {
                            //mailer.mailer(email, 'done', '<b> Done downloading file ' + filename + ' </b>');

                            fs.unlink(loc, (err) => {
                                if (err) throw err;
                                console.log('Compressed file was deleted');
                            });

                            downloadStatus.setStatus(downloadID, 4, function(err, res) {
                                projectDB.updateImageSource(projectID,map_link).then(function(d){
                                    console.log("Map Link updated")
                                })
                            });
                        });
                    });
                }).catch(function(err) {
                    downloadStatus.setStatus(downloadID, 4, function(err, res) {
                    });
                });
            });

        }


    });
}


function downloadDrop(loc, downloadID, projectID) {
    console.log('In Download2');
    projectDB.addDataSetID(projectID, downloadID).then(function() {
        // Status starting Download
        downloadStatus.setStatus(downloadID, 1, function(err, res) {

        });

        var downloadDir = 'temp/';
        var datasetDir = 'dataset/';
        console.log('Before Wget');

        if (!fs.existsSync(downloadDir + downloadID)) {
            console.log('before making directory');
            console.log(downloadDir + downloadID)
            fs.mkdirSync(downloadDir + downloadID);
        }
        var wget = 'wget --max-redirect=20 ' + '-O ' + downloadDir + downloadID +'/download-drop.zip'+ ' ' + loc;
        console.log('wget ', wget);

        exec(wget, {maxBuffer: 1024 * 10000000}, function(err) {

            if (err) {
                // status error with file
                console.log('error');
                console.log(err);
                downloadStatus.setStatus(downloadID, -1, function(err, res) {
                });
            } else {
                // status downloaded
                console.log('In success setting download status');
                downloadStatus.setStatus(downloadID, 2, function(err, res) {
                });
                // var filename = url.parse(loc).pathname;
                // var parsedFilename = path.parse(filename);
                // console.log('filename ', filename, " ..... ", parsedFilename);
                // var type = parsedFilename.ext;

                var dirName = 'dataset/' + downloadID;



                if (!fs.existsSync(dirName)) {
                    fs.mkdirSync(dirName);
                }

                var filename = downloadDir + downloadID + '/download-drop.zip';
                var parsedFilename = path.parse(filename);
                console.log('filename ', filename, " ..... ", parsedFilename);
                var type = parsedFilename.ext;

                if (type == '.gz' || type == '.tar') {
                    console.log('TAR FILE');

                    var tarFile = 'temp/' + downloadID;

                    // status started unzipping
                    downloadStatus.setStatus(downloadID, 3, function(err, res) {
                    });

                    var untar = spawn('tar', ['-xvf', tarFile, '-C', dirName + '/.']);

                    untar.stdout.on('data', function(data) {
                        console.log('on tar data', data)
                    });

                    untar.on('close', function(code) {
                        console.log('code ', code);
                        if (code == 0) {
                            readDataSetFiles(dirName, downloadID).then(imageCompressionLibNoExif.processData).then(function(data) {
                                console.log('data in read files', data);
                                projectDB.createDataSetTable(downloadID).then(function(d) {
                                    var pArr = [];
                                    for (var i in data) {
                                        var name = i;
                                        var x = data[i].x;
                                        var y = data[i].y;
                                        var p = projectDB.createDataSetItem(downloadID, name, x, y);
                                        p.catch(function(err) {
                                            return null;
                                        });
                                        pArr.push(p);
                                    }

                                    Promise.all(pArr).then(function(data) {
                                        downloadStatus.setStatus(downloadID, 4, function(err, res) {
                                        });
                                    });
                                });
                            }).catch(function(err) {
                                downloadStatus.setStatus(downloadID, 4, function(err, res) {
                                });
                            });
                        }
                    });

                } else if (type == '.zip') {
                    console.log('ZIP FILE');

                    var zip = 'temp/' + downloadID+ '/download-drop.zip';

                    fs.chmod(zip, 0755, function(err){
                        if(err) throw err;
                    });

                    // status started unzipping
                    downloadStatus.setStatus(downloadID, 3, function(err, res) {
                    });

                   // var un = fs.createReadStream(zip).pipe(unzip.Extract({ path: dirName+"/"+downloadID }));
                    console.log(zip, dirName);

                    Minizip.unzip(zip, dirName, function(err) {
                        if (err)
                            console.log(err);
                        else
                            console.log('unzip successfully.');

                        readDataSetFiles(dirName, downloadID).then(imageCompressionLibWithExif.processData).then(function(data) {
                            console.log('data in read files', data);
                            projectDB.createDataSetTable(downloadID).then(function(d) {
                                var pArr = [];
                                for (var i in data) {
                                    var name = i;
                                    var x = data[i].x;
                                    var y = data[i].y;
                                    var p = projectDB.createDataSetItem(downloadID, name, x, y);
                                    p.catch(function(err) {
                                        return null;
                                    });
                                    pArr.push(p);
                                }

                                Promise.all(pArr).then(function(data) {
                                    downloadStatus.setStatus(downloadID, 4, function(err, res) {
                                    });
                                });
                            });
                        }).catch(function(err) {
                            downloadStatus.setStatus(downloadID, 4, function(err, res) {
                            });
                        });
                    });

                }
            }
        });
    });
}

function downloadRec(loc, downloadID, projectID, regex) {
  // Status starting Download
  projectDB.addDataSetID(projectID, downloadID).then(function() {
    downloadStatus.setStatus(downloadID, 1, function(err, res) {

    });
    console.log('in download rec...');

    regex = regex ? '\'' + regex + '\'' : 'jpeg,jpg,png';

    var downloadDir = 'temp/';
    var wget = 'wget ' + '-nd -r -A ' + regex + ' -P ' + downloadDir + downloadID + ' ' + loc;

    var filename = url.parse(loc).pathname;

    //@TODO CHANGE TO SPAWN, no need for max buffer
    exec(wget, {maxBuffer: 1024 * 10000000}, function(err) {
      if (err) {
        mailer.mailer(email, 'done', '<b> Error downloading file </b>');
        // status error with file
        downloadStatus.setStatus(downloadID, -1, function(err, res) {
        });
      } else {
        // status downloaded\
        downloadStatus.setStatus(downloadID, 2, function(err, res) {
        });

        var dirName = 'dataset/' + downloadID;

        if (!fs.existsSync(dirName)) {
          fs.mkdirSync(dirName);
        }

        ncp(downloadDir + downloadID, dirName, function(err) {
          if (err) {
            return err;
          }
          deleteFolderRecursive(downloadDir + downloadID);
          readDataSetFiles(dirName, downloadID).then(imageCompressionLibWithExif.processData).then(function(data) {
            projectDB.createDataSetTable(downloadID).then(function(d) {
              //  console.log('data ', data);
              var pArr = [];
              for (var i in data) {
                  console.log('i ', i);
                var name = i;
                var x = data[i].x || 42.204;
                var y = data[i].y || -82.111;
                var p = projectDB.createDataSetItem(downloadID, name, x, y);
                p.catch(function(err) {
                  return null;
                });
                pArr.push(p);
              }

              Promise.all(pArr).then(function(data) {
                mailer.mailer(email, 'done', '<b> Done downloading file ' + filename + ' </b>');
                downloadStatus.setStatus(downloadID, 4, function(err, res) {
                });
              });

            });
          });
        });
      }
    });
  });
}

function download2(loc, downloadID, projectID) {
  projectDB.addDataSetID(projectID, downloadID).then(function() {
    // Status starting Download
    downloadStatus.setStatus(downloadID, 1, function(err, res) {

    });

    var downloadDir = 'temp/';
    var datasetDir = 'dataset/';
    var wget = 'wget --max-redirect=20 ' + '-O ' + downloadDir + downloadID +'/'+'download-drop.gz'+ ' ' + loc;

    exec(wget, {maxBuffer: 1024 * 10000000}, function(err) {

      if (err) {
        mailer.mailer(email, 'done', '<b> Error downloading file </b>');
        // status error with file
        downloadStatus.setStatus(downloadID, -1, function(err, res) {
        });
      } else {
        // status downloaded
        downloadStatus.setStatus(downloadID, 2, function(err, res) {
        });
        var filename = url.parse(loc).pathname;
        var parsedFilename = path.parse(filename);

        var type = parsedFilename.ext;

        var dirName = 'dataset/' + downloadID;

        if (!fs.existsSync(dirName)) {
          fs.mkdirSync(dirName);
        }

        if (type == '.gz' || type == '.tar' || type == '.zip') {
          console.log('TAR FILE');

          var tarFile = 'temp/' + downloadID;

          // status started unzipping
          downloadStatus.setStatus(downloadID, 3, function(err, res) {
          });

          var untar = spawn('tar', ['-xvf', tarFile, '-C', dirName + '/.']);

          untar.stdout.on('data', function(data) {
              console.log('data ', data);
          });

          untar.on('close', function(code) {

            if (code == 0) {
              readDataSetFiles(dirName, downloadID).then(imageCompressionLibNoExif.processData).then(function(data) {

                projectDB.createDataSetTable(downloadID).then(function(d) {
                  var pArr = [];
                  for (var i in data) {
                    var name = i;
                    var x = data[i].x;
                    var y = data[i].y;
                    var p = projectDB.createDataSetItem(downloadID, name, x, y);
                    p.catch(function(err) {
                      return null;
                    });
                    pArr.push(p);
                  }

                  Promise.all(pArr).then(function(data) {
                    mailer.mailer(email, 'done', '<b> Done downloading file ' + filename + ' </b>');
                    downloadStatus.setStatus(downloadID, 4, function(err, res) {
                    });
                  });
                });
              }).catch(function(err) {
                mailer.mailer(email, 'done', '<b> Error downloading file ' + filename + ' </b>');
                downloadStatus.setStatus(downloadID, 4, function(err, res) {
                });
              });
            }
          });

        } else if (type == '.zip') {
          console.log('ZIP FILE');
        }
      }
    });
  });
}

function assignDownloadID(done) {
  var downloadID = randomString.generate({
    length: 15,
    charset: 'alphanumeric'
  });
  downloadStatus.checkUnique(downloadID, function(err, res) {
    if (res.length > 0) {
      assignDownloadID(done);
    } else {
      done(downloadID);
    }
  });
}

function readDataSetFiles(dirName, dataSetID) {


  var p = new Promise(function(resolve, error) {
    fs.readdir(dirName, function(err, items) {
        console.log('items', items);
        var filtered_items = [];

        //skip all hidden files:
        items.forEach(function (it){

           // if (it.charAt(0) != '.' && it.charAt(0) != '_'){

            if (it.endsWith('.jpg') || it.endsWith('.png')){

                filtered_items.push(it);
            }

        });
        console.log('filtered items', filtered_items);


        if (!err) {
        this.dirName = dirName;
        this.dataSetID = dataSetID;
        resolve(filtered_items);
      } else {
            console.log("error: " + err);
        error(err);
      }
    });
  });
  p.bind({});
  return p;
}

function readCSVs(files) {
    console.log('files to read csv ', files);
    return new Promise(function(resolve, error) {
            var processingTemp = this.dirName + '/tmp';

            if (!fs.existsSync(processingTemp)) {
                fs.mkdirSync(processingTemp);
            }

            var fnameMap = {};
            var pArr = [];
            for (var i in files) {
                var p = readPoints(this.dirName + '/' + files[i]);
                p.catch(function(err) {
                    return null;
                });
                pArr.push(p);

            }

            var dirName = this.dirName;
            //read all csvs then for all points found, return the
            Promise.all(pArr).then(function(dataArr) {
                for (var i in dataArr) {
                    var data = dataArr[i];
                    if (data != null) {
                        for (var p in data){
                            var or_point = data[p];
                            if (or_point.name != undefined){
                            //make sure the formats are x,y for latitude longitude
                            var point = {};
                            point.name = or_point.name;
                            if (or_point.hasOwnProperty('latitude') && !or_point.hasOwnProperty('x')) {
                                point.x = or_point.latitude;
                            } else {
                                point.x = or_point.x;
                            }
                            if (or_point.hasOwnProperty('longitude') && !or_point.hasOwnProperty('y')) {
                                point.y = or_point.longitude;
                            } else {
                                point.y = or_point.y;
                            }
                            fnameMap[point.name] = point;
                            }
                        }
                    }
                }
                // for (var f in files) {
                //     fs.unlinkSync(dirName + '/' + files[f]);
                // }

                resolve(fnameMap);
            }).catch(function(err) {
                error(err);
            });

        }
    );
};

//read pois from CSV
function readPoints(fName){
    return new Promise(function(resolve, reject) {
        console.log("Will read csv: " + fName)
        //read csv file using d3

        if (fName.endsWith('.csv')){
            fs.readFile(fName, 'utf8', function (err, data) {
                var csv_data = d3.csvParse(data);
                resolve(csv_data);
            });
        } else {
            resolve([])
        }




    }).catch(function(err) {
    reject(err);
});

}





function deleteFolderRecursive(path) {
  console.log('delete folder recursive');
  console.log('path ', path);
  if (fs.existsSync(path)) {

    console.log('fs exists');
    console.log(fs.readdirSync(path));
    fs.readdirSync(path).forEach(function(file, index) {
      var curPath = path + '/' + file;
      console.log('curPath ', curPath);
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
};

module.exports = router;
