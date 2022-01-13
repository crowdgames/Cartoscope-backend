cd /vagrant

echo "== READING DB AUTH CONFIG =="

if [ -e "vagrant-files/config-auth.sh" ]; then
    source vagrant-files/config-auth.sh
else
    echo "Note: using config-auth.sh.example for provisioning. It is recommended to copy / edit this file into config-auth.sh"
    source vagrant-files/config-auth.sh.example
fi

echo "== PRECONFIGURING MYSQL SERVER INSTALL =="

echo mysql-server mysql-server/root_password password $MYSQL_ROOT_PASSWORD | sudo debconf-set-selections
echo mysql-server mysql-server/root_password_again password $MYSQL_ROOT_PASSWORD | sudo debconf-set-selections

echo "== INSTALLING MAJOR PACKAGES =="

export DEBIAN_FRONTEND=noninteractive

sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt-get update

sudo apt-get -y install \
  python3.6 python-pip python3-pip \
  mysql-client mysql-server \
  nodejs npm \
  wget \
  dos2unix \
  openssl \
  build-essential libffi-dev python3-dev \
  python-cairosvg

echo "== INSTALLING PYTHON PACKAGES =="

python3.6 -m pip install --upgrade pip
python3.6 -m pip install pillow
python3.6 -m pip install bcrypt
python3.6 -m pip install CairoSVG
python3.6 -m pip install certifi
python3.6 -m pip install mapbox-vector-tile

echo "== INSTALLING APPROPRIATE NODE VERSION =="

sudo npm i -g n

sudo n 10.19.0

PATH="$PATH"

echo "== CREATING DATABASES =="

echo "CREATE DATABASE convergeDB;" | mysql -u root -p$MYSQL_ROOT_PASSWORD
echo "CREATE USER 'converge'@'localhost' IDENTIFIED BY '$MYSQL_USER_PASSWORD';" | mysql -u root -p$MYSQL_ROOT_PASSWORD
echo "GRANT ALL PRIVILEGES ON convergeDB.* TO 'converge'@'localhost';" | mysql -u root -p$MYSQL_ROOT_PASSWORD
mysql convergeDB -u converge -p$MYSQL_USER_PASSWORD < /vagrant/database_migrations/dump.sql

echo "== CREATING FOLDERS AND MOVING FILES =="

mkdir temp
mkdir dataset

cp vagrant-files/run.sh /home/vagrant/
dos2unix /home/vagrant/run.sh
chmod +x /home/vagrant/run.sh

echo "== CREATING SSL KEYS AND CERTS =="

openssl req -batch -newkey rsa:2048 -nodes -keyout domain.key -x509 -days 365 -out domain.crt

echo "== SETTING UP ENV VARIABLES =="

cat vagrant-files/envs.sh >> /home/vagrant/.bashrc
/usr/bin/python3.6 vagrant-files/salt_generator.py >> /home/vagrant/.bashrc

echo "== INSTALLING NODE MODULES =="

npm config set python /usr/bin/python3.6
sudo npm i
sudo npm i -g nodemon typescript bower

echo "== INSTALLING BOWER MODULES =="

cd ./public
bower install
