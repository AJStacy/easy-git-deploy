var gulp = require('gulp');
var gulpDocumentation = require('gulp-documentation');
var ts = require('gulp-typescript');

// Generating a pretty HTML documentation site
gulp.task('docs', function () {
  return gulp.src('./index.js')
    .pipe(gulpDocumentation('html'))
    .pipe(gulp.dest('./docs/'));
});

// Compile the Typescript
gulp.task('typescript', function () {
  return gulp.src('./src/**/*.ts')
    .pipe(ts({
      "noImplicitAny": false,
      "removeComments": true,
      "sourceMap": true,
      "out": "GitLabAutoDeploy.js"
    }))
    .pipe(gulp.dest('./bin'));
});

gulp.task('watch', function() {
  gulp.watch('./src/**/*.ts', ['typescript']);
});

gulp.task('default', ['docs', 'typescript']);