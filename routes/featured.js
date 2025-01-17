var express = require('express');
var router = express.Router();
var projectDB = require('../db/project');

module.exports = router;

router.get('/', function(req, res, next) {

    res.redirect("https://cartosco.pe/landloss");
    /**
     * Previously, the database 'featured_url_route' would have a list of projects of which one could be chosen randomly, however right now I've hardcoded just to send to whatever the landloss project is
    projectDB.getFeaturedProject().then(function(data) {
    var redirectUrl = '/';
    if(data.length > 0) {

      //pick one at random
      var rand_index = randomInt(0,data.length-1);
      var featured = data[rand_index];
      if (featured.code) {
        redirectUrl = '/#kioskProject/'+featured.code;
      } else if(featured.url) {
        redirectUrl = featured.url;
      }
    }
    res.writeHead(302, {
      'Location': redirectUrl
    });
    res.end();
  });
  */
});


//return random integer [min,max]
function randomInt(min,max){
    return (Math.floor(Math.random() * (max - min + 1) ) + min);
}

