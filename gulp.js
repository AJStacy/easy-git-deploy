var gulp = require('gulp');
var gulpDocumentation = require('gulp-documentation');

// Generating a pretty HTML documentation site
gulp.task('documentation-html-example', function () {
  return gulp.src('./index.js')
    .pipe(gulpDocumentation('html'))
    .pipe(gulp.dest('./docs/'));
});