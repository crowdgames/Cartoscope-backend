/**
 * Created by kiprasad on 03/10/16.
 */
var express = require('express');
var router = express.Router();
var projectDB = require('../db/project');
var anonUserDB = require('../db/anonUser');
var filters = require('../constants/filters');
var fs = require('fs');
var passport = require('passport');
var path = require('path');
module.exports = router;
var Promise = require('bluebird');
var all = Promise.all;
var ss = require('seededshuffle');
var dsDB = require('../db/downloadStatus');

router.get('/getInfo/:code', [filters.requireLogin], function(req, res, next) {
  checkUserAllowedAccess(req.session.passport.user, req.params.code).then(function(data) {
    console.log('In CheckUserAllowed Acess', data);
    var getProject = projectDB.getProjectFromCode(req.params.code);
    getProject.then(function(project) {
      if (project.length > 0) {
        var getDataSetSize = projectDB.getDataSetSize(project[0]['dataset_id']);
        var getProgress = projectDB.getProgress(project[0].id, req.session.passport.user);
        
        getProgress.catch(function(err) {
          res.status(500).send({error: 'Progress not found'});
          return null;
        });
        
        getDataSetSize.catch(function(err) {
          res.status(500).send({error: 'Data set not found'});
          return -1;
        });
        
        Promise.join(getProgress, getDataSetSize, function(progress, datasetSize) {
          if (progress && datasetSize > 0) {
            var data = project[0];
            data.progress = progress.progress;
            data.size = datasetSize;
            res.send(data);
          } else {
            res.status(500).send({error: 'Progress not found'});
          }
        });
      } else {
        res.status(500).send({error: 'Project not found'});
      }
    }).catch(function(error) {
      res.status(500).send({error: error.code || 'Project not found'});
    });
  }).catch(function(err) {
    if (err.code) {
      res.status(500).send({error: err.code});
    } else {
      res.status(401).send({error: 'You are not allowed to access this project'});
    }
  });
});

router.get('/getInfoId/:id', [filters.requireRegularLogin], function(req, res, next) {
  var getProject = projectDB.getProjectFromId(req.params.id);
  getProject.then(function(project) {

    if (project.length > 0) {
      var getDataSetSize = projectDB.getDataSetSize(project[0]['dataset_id']);
      var getProgress = projectDB.getProgressNotNullOnEmpty(project[0].id, req.session.passport.user);
      
      getProgress.catch(function(err) {
        res.status(500).send({error: 'Progress not found'});
        return null;
      });
      
      getDataSetSize.catch(function(err) {
        res.status(500).send({error: 'Data set not found'});
        return -1;
      });
      
      Promise.join(getProgress, getDataSetSize, function(progress, datasetSize) {
        if (progress && datasetSize > 0) {
          var data = project[0];
          data.progress = progress.progress;
          data.size = datasetSize;
          res.send(data);
        } else {
          res.status(500).send({error: 'Progress not found'});
        }
      });
    } else {
      res.status(500).send({error: 'Project not found'});
    }
  }).catch(function(error) {
    res.status(500).send({error: error.code || 'Project not found'});
  });
});

function checkUserAllowedAccess(user, projectCode) {
  return new Promise(function(resolve, error) {
    if (user.anonymous) {
        console.log('before findConsentedMTurkWorkerFromHash');
      var mturk = anonUserDB.findConsentedMTurkWorkerFromHash(user.id, projectCode).then(function(userData) {
        if (userData.consented) {
          resolve(true);
        } else {
          error(false);
        }
      });

      var kiosk = anonUserDB.findConsentedKioskWorker(user.id, projectCode).then(function(userData) {
          console.log('before findConsentedKioskWorker');
          if (userData.consented) {
            console.log('userData ', userData);
              resolve(true);
          } else {
              error(false);
          }});
      // },function(err) {
      //   error(err);
      // }
      //    );

       if(mturk || kiosk)
         resolve(true);
       else
         error(false);

    } else {
      resolve(true);
    }
  });
}

router.get('/gettask/:code', [filters.requireLogin], function(req, res, next) {
  projectDB.getSingleProjectFromCode(req.params.code).then(function(project) {
    console.log("IN Task get task "+ project);
      var user = req.session.passport.user;
    var dataSetId = project['dataset_id'];
    if (!dataSetId) {
      res.status(500).send({error: 'No data set found'});
    } else {
      var dataSetSize = projectDB.getDataSetSize(dataSetId);
      var getProgress = projectDB.getProgress(project.id, req.session.passport.user);
      var userID = req.session.passport.user.id;
      dataSetSize.catch(function(err) {
        res.status(500).send({error: 'Data set not found'});
        return -1;
      });
      
      getProgress.catch(function(err) {
        res.status(500).send({error: 'Progress not found'});
        return null;
      });
      
      Promise.join(dataSetSize, getProgress, function(dataSetSize, progressItem) {
        if (dataSetSize == -1 || !progressItem) {
          res.status(500).send({error: 'Data set not found or Progress not created.'});
        } else {
          processItems(dataSetId, dataSetSize, progressItem, userID, user.type).then(function(data) {
            if (data) {
              res.send({
                items: data,
                dataset: dataSetId,
                finished: false
              });
            } else {
              res.send({
                dataset: dataSetId,
                items: [],
                finished: true
              });
            }
          }).catch(function(err) {
            res.status(500).send({error: err.code || 'Could not retrieve items'});
          });
        }
      });
    }
  }).catch(function(err) {
    res.status(500).send({error: err.code || 'Task not found'});
  });
});

function processItems(dataSetId, dataSetSize, progressItem, userID, userType) {
    console.log('Data Set Size', dataSetSize);
    console.log('processs data', progressItem);

  return new Promise(function(resolve, reject) {
      var order = [];
      var progressD=0;
      for (var i = 1; i <= dataSetSize; i++) {
          order.push(i);
      }
      var userIDStr = userID + '';

    if(dataSetSize <= progressItem.progress && userType == "kiosk" ){
        progressD=1;
        order = [];
        for (var i = 1; i <= dataSetSize; i++) {
            order.push(i);
        }
        console.log(' in datasetsize equals progress ', order, dataSetSize);
        order = ss.shuffle(order, userIDStr.substr(userIDStr.length - 8));
        order = order.slice(progressD - 1, progressD + 4);
        console.log('new orders'+ order);
    } else{
        progressD = progressItem.progress;
        order = ss.shuffle(order, userIDStr.substr(userIDStr.length - 8));
        order = order.slice(progressD - 1, progressD + 4);
    }

    console.log('Progress  ', progressItem.progress);

   // var userIDStr = userID + '';
    //order = ss.shuffle(order, userIDStr.substr(userIDStr.length - 8));
    console.log('order ', order);


    if (order.length > 0) {
      var promises = [];
      
      for (i in order) {
        var p = projectDB.getDataSetItem(dataSetId, order[i]).catch(function(e) {
          return [];
        });
        promises.push(p);
      }
      all(promises).then(function(values) {
        var ids = values.reduce(function(acc, value) {
          if (value.length > 0 && value[0].name) {
            acc.push(value[0].name);
          }
          return acc;
        }, []);
        
        if (ids.length != order.length) {
          reject(-1);
        } else {
          resolve(ids);
        }
      });
      
    } else {
      resolve(null);
    }
  });
}

router.get('/getImage/:dataset/:name', [filters.requireLogin], function(req, res, next) {
  res.setHeader('Content-Type', 'image/jpeg');
  if (fs.existsSync('dataset/' + req.params.dataset + '/' + req.params.name + '.jpg')) {
    res.sendFile(path.resolve('dataset/' + req.params.dataset + '/' + req.params.name + '.jpg'));
  } else {
    res.status(404).send();
  }
});

router.get('/startProject/:project', [filters.requireLogin], function(req, res, next) {
  var user = req.session.passport.user;
  console.log('user', user);
  projectDB.getSingleProjectFromCode(req.params.project).then(checkDataSetReady).then(function(project) {
    if (user.anonymous) {
      if (user.consented) {
        console.log("User Consented");
        projectDB.findProgress(project, user.id, 1).then(function(data) {
          if ('progress' in data) {
            res.redirect('/task.html#/?code=' + req.params.project+ '&type='+req.session.passport.user.type);
          } else {
            res.status(500).send({error: 'No progress could be found'});
          }
        }).catch(function(err) {
          //console.log('in Error in start Project');
          res.status(500).send({error: err.code});
        });
      } else {
        res.redirect('api/anon/startAnon/' + req.params.project);
      }
    } else {
      projectDB.findProgress(project, user.id, 0).then(function(data) {
        if ('progress' in data) {
          res.redirect('/task.html#/?code=' + req.params.project);
        } else {
          res.status(500).send({error: 'No progress could be found'});
        }
      }).catch(function(err) {
        res.status(500).send({error: err.code});
      });
    }
  }).catch(function(error) {
    res.status(500).send({error: error.code || 'Project not found'});
  });
});

function checkDataSetReady(project) {
  return new Promise(function(resolve, reject) {
    var datasetID = project['dataset_id'];
    dsDB.getDataSetStatus(datasetID).then(function(data) {
      if (data.status == 4) {
        resolve(project);
      } else {
        reject({code: 'Project not yet ready'});
      }
    }).catch(function(error) {
      reject(error);
    });
  });
}

router.post('/submit', [filters.requireLogin, filters.requiredParamHandler(['taskID', 'option', 'projectID'])],
  function(req, res, next) {

    console.log('in submit');
    var taskID = req.body.taskID;
    var response = req.body.option;
    var projectID = req.body.projectID;
    var userID = req.session.passport.user.id;

    console.log(taskID, response, projectID, userID);
    
    projectDB.addResponse(userID, projectID, taskID, response).then(projectDB.increaseProgress(userID, projectID))
      .then(function(data) {
        console.log('data inserted', data);
        res.send({});
      }).catch(function(err) {
      res.status(500).send({err: err.code || 'Could not submit response'});
    });
  });
