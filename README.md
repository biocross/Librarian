
<div align="center">
<img width="500" src="https://raw.githubusercontent.com/biocross/Librarian-Web/master/assets/LogoText_medium.png" alt="Librarian"><br/><br/>
</div>


> Librarian is an easy way to host your iOS & Android builds locally, and provide instant installs onsite.


## Highlights

- [x] Support for iOS & Android Builds
- [x] Simple & Quick Setup
- [x] Clean Web Interface served over HTTPS
- [x] Easily add builds
- [x] Ability to have Public URLs for builds
- [x] Almost instant app installs on the local network
- [x] No more dependence on `Fabric` / `Testflight`

## Install

```console
$ npm install -g librarian-server
$ librarian setup
```
The setup will ask you a few questions to configure Librarian on your system. You can just press return throughout the process to choose the default values.

## Usage

### Starting Librarian

Run the following command to start the Librarian server.  

```console
$ librarian start
```
This will start the web interface, and will print the URL to it on the console, along with a QR code to the URL for quick access 😁

> Librarian uses [ngrok](https://ngrok.com/product) tunneling to serve your localhost over the Internet using a secure `HTTPS` tunnel.

### Submitting Builds

Submit builds to Librarian using:

```console
$ librarian submit <pathToFile> [options]
```
The `pathToFile` must be the full path to the `IPA` or `APK` file. Example: `/Users/jenkins/MyApp.ipa`, and should be accessible by Librarian.

You can pass in the following additional options along with the path of the build file.

Option | Short | Example | Description
--- | --- | --- | ---
`--branch <branch>` | `-b` | `--branch master` | git branch the build is from
`--notes <notes>` | `-n` | `--notes "Release Candidate Build"` | release notes for the build
`--public` | `-p` | Just add the flag `--public` | allow the build to be downloaded over the HTTPs tunnel (by default, builds can only be downloaded on the local network)

Librarian will autodetect the type of build `iOS / Android` using the file extension, will create a copy of the build in it's assets, and make it available for download on it's web interface.

> The Librarian server should be running while submitting a build.

## Updating Librarian

Librarian follows [semantic versioning](https://semver.org/). You can update by running:

```console
$ npm i -g librarian
$ librarian update
```

## Contributing

Librarian is built up of two parts:

- [Librarian](https://github.com/biocross/Librarian) - The Command Line tool, written in NodeJS (this repository).
- [Librarian Web](https://github.com/biocross/Librarian-Web) - The Web Interface of Librarian, built in Jekyll.


## Maintainers

Developed by [biocross](https://twitter.com/sids7) & designed by [madebytushar](https://twitter.com/madebytushar)

## License

MIT