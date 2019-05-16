var db = require('../db/db');
var Promise = require('bluebird');
var databaseName = process.env.CARTO_DB_NAME;

//other db functions
var projectDB = require('../db/project');



//DB functions for Tileoscope and Tileoscope AR games


exports.addResponseTileoscope = function(userId, projectId, task_list, response) {
    return new Promise(function(resolve, error) {
        var connection = db.get();

        var values_list = "";
        //for every item in the task list, make an item to add:
        for (var i = 0; i < task_list.length; i++) {

            //make sure we don't enter empty image
            if (task_list[i] != ""){
                var task = "\"" + task_list[i] + "\"";
                var vl = [userId,projectId,task,response,1]
                values_list += "(" + vl.toString() + "),"
            }


        }
        //remove last , from values_list
        values_list = values_list.slice(0, -1);

        connection.queryAsync('INSERT INTO response (user_id, project_id,task_id,response,site_id) VALUES ' + values_list).then(
            function(data) {
                if (data.insertId) {
                    resolve(data.affectedRows);
                } else {
                    error({code: 'Problem with insert'});
                }
            }, function(err) {
                error(err);
            });
    });
};


exports.submitTileoscopeMove = function(userId, hitId, response) {
    return new Promise(function(resolve, error) {
        var connection = db.get();



        connection.queryAsync('INSERT INTO tileoscope_moves (user_id, hit_id,response) VALUES(?,?,?) ',[userId,hitId,response]).then(
            function(data) {
                if (data.insertId) {
                    resolve(data.affectedRows);
                } else {
                    error({code: 'Problem with insert'});
                }
            }, function(err) {
                error(err);
            });
    });
};


exports.submitTileoscopeARAction = function(session_id, short_name, response) {
    return new Promise(function(resolve, error) {
        var connection = db.get();



        connection.queryAsync('INSERT INTO tileoscope_ar_actions (session_id, dataset,action) VALUES(?,?,?) ',[sesion_id,short_name,response]).then(
            function(data) {
                if (data.insertId) {
                    resolve(data.affectedRows);
                } else {
                    error({code: 'Problem with insert'});
                }
            }, function(err) {
                error(err);
            });
    });
};



//get all the actions for a specific session
exports.getTileoscopeARActionsBySessionId = function(session_id) {
    return new Promise(function(resolve, error) {
        var connection = db.get();
        connection.queryAsync('SELECT * from tileoscope_ar_actions where session_id=?  ', [session_id])
            .then(
                function(data) {
                    resolve(data);
                }, function(err) {
                    error(err);
                });
    });
};


//get all the actions for a specific dataset
exports.getTileoscopeARActionsByDataset = function(dataset) {
    return new Promise(function(resolve, error) {
        var connection = db.get();
        connection.queryAsync('SELECT * from tileoscope_ar_actions where short_name=?  ', [short_name])
            .then(
                function(data) {
                    resolve(data);
                }, function(err) {
                    error(err);
                });
    });
};


//get all the moves for a specific trial
exports.getTileoscopeMoves = function(trialId) {
    return new Promise(function(resolve, error) {
        var connection = db.get();
        connection.queryAsync('SELECT * from tileoscope_moves where hit_id=?  ', [trialId])
            .then(
                function(data) {
                    resolve(data);
                }, function(err) {
                    error(err);
                });
    });
};


//get the active genetic tree for the given main code
exports.getCreatedSequenceTileoscope = function(id) {
    return new Promise(function(resolve, error) {
        var connection = db.get();
        connection.queryAsync('SELECT * from tileoscope_task_genetic_sequences where id=?  ', [id])
            .then(
                function(data) {
                    resolve(data);
                }, function(err) {
                    error(err);
                });
    });
};



//get the active genetic tree for the given main code
exports.pickSequenceFeaturedTileoscope = function() {
    return new Promise(function(resolve, error) {
        var connection = db.get();
        connection.queryAsync('SELECT id as genetic_id,seq,method from tileoscope_task_genetic_sequences where method="featured" ORDER BY RAND() LIMIT 1 ')
            .then(
                function(data) {
                    resolve(data[0]);
                }, function(err) {
                    error(err);
                });
    });
};


//update project status for ar
exports.updateARProjectStatus = function(code) {
    return new Promise(function(resolve, error) {
        var connection = db.get();
        connection.queryAsync('update projects set ar_status=1 where unique_code=?  ', [code])
            .then(
                function(data) {
                    resolve(data);
                }, function(err) {
                    error(err);
                });
    });
};


//update project status for ar
exports.setARStatus = function(code,status) {
    return new Promise(function(resolve, error) {
        var connection = db.get();
        connection.queryAsync('update projects set ar_status=? where unique_code=?  ', [status,code])
            .then(
                function(data) {
                    resolve(data);
                }, function(err) {
                    error(err);
                });
    });
};



//get all the projects that are Tileoscope Ready
exports.getTileoscopeARProjects = function() {
    return new Promise(function(resolve, error) {
        var connection = db.get();
        connection.queryAsync('SELECT name,short_name,description,unique_code,dataset_id,has_location,template from projects where ar_ready=1 and ar_status=1')
            .then(
                function(data) {
                    resolve(data);
                }, function(err) {
                    error(err);
                });
    });
};




//get all the projects that are Tileoscope Ready
exports.getTileoscopeProjectImageList = function(dataset_id) {
    return new Promise(function(resolve, error) {
        var connection = db.get();

        var d_id = "dataset_" + dataset_id;

        connection.queryAsync('SELECT name,x,y from '+ d_id)
            .then(
                function(data) {
                    resolve(data);
                }, function(err) {
                    error(err);
                });
    });
};



//generate the dataset info json
exports.generateTileoscopeARDatasetInfoJSON = function(unique_code) {
    return new Promise(function(resolve, error) {


        var dataset_info_json = {
            categoriesCount: 0,         //number of categories
            categoriesLabel: [],        //categories
            categoriesSample: [],       //representative image for each category (from tutorial table)
            code: unique_code,
            count: 0,                   //how many images in the set
            dataset_id: '',
            description: '',
            filenames: [],              //names of images without extension
            has_location: 0,
            name: '',
            short_name: '',
            tutorial: []                //at least one pair of images of the same category
        };


        //first get the project, then get the name list, then get the tutorial images


        projectDB.getProjectFromCodeUnPub(unique_code).then(function(project_data) {


            var project = project_data[0];
           // console.log(project);

            var dataset_id = project.dataset_id;
            dataset_info_json.dataset_id = dataset_id;
            dataset_info_json.name = project.name;
            dataset_info_json.short_name = project.short_name;
            dataset_info_json.description = project.description;
            dataset_info_json.has_location = project.has_location;


            //get categories and count here from template:

            var template_raw = JSON.parse(project.template);
            var categories_raw = template_raw.options;
            var categories =  [];

            for (item in categories_raw){
                categories.push(categories_raw[item].text)
            }
            var categories_count = categories.length;

            //console.log(categories);
            //console.log(categories_count);

            dataset_info_json.categoriesCount = categories_count;
            dataset_info_json.categoriesLabel = categories;

            //get all the filenames from the table
            projectDB.getDataSetNames(dataset_id).then(function(image_data) {


                var image_list = image_data[0].image_list.split(',');
                dataset_info_json.filenames = image_list;
                dataset_info_json.count = image_list.length;

                //get the tutorial items, images as is should
                projectDB.getTutorialFromCode(unique_code).then(function(tutorial_items) {

                    var tut_images = [];
                    var tut_categories = {};

                    for(item in tutorial_items){

                        var tut = tutorial_items[item];

                        //console.log(tut)

                        var tut_image_raw = tut.image_name;
                        var tut_answer = tut.answer;
                        //remove extension and prefix from image name
                        var tut_image = tut_image_raw.substring(
                            tut_image_raw.lastIndexOf("/") + 1,
                            tut_image_raw.lastIndexOf(".")
                        );


                        //keep track of how many have more than one images
                        if (tut_categories.hasOwnProperty(tut_answer)) {


                            tut_categories[tut_answer].push(tut_image)

                        } else {
                            tut_categories[tut_answer] = [tut_image];

                        }

                    }


                    for (cat in tut_categories){

                        //use the first of each category as the representative
                        tut_images.push(tut_categories[cat][0]);

                        //TODO: Right now we are only pushing pairs to tutorial
                        if (tut_categories[cat].length >= 2) {

                            console.log("Adding images")
                            dataset_info_json.tutorial.push(tut_categories[cat][0]);
                            dataset_info_json.tutorial.push(tut_categories[cat][1]);

                        }
                    }

                    dataset_info_json.categoriesSample = tut_images;


                    //send everything
                    resolve(dataset_info_json)


                }, function(err){
                    console.log("Error fetching image names from table")
                    console.log(err);
                    error(err)
                })





            }, function(err){
                console.log("Error fetching image names from table")
                console.log(err);
                error(err)
            })




        }, function(err){
            console.log("Error fetching project from code")
                console.log(err);
                error(err)
            })


    });
};
