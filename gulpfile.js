var gulp = require('gulp');
var ts = require('gulp-typescript');
var typedoc = require('gulp-typedoc');

// Compile the Typescript
gulp.task('typescript', function () {
  return gulp.src('./src/**/*.ts')
    .pipe(ts({
      "noImplicitAny": false,
      "removeComments": true,
      "sourceMap": true
    }))
    .pipe(gulp.dest('./bin'));
});

gulp.task('docs', function() {
  return gulp
    .src(["./src/**/*.ts"])
    .pipe(typedoc({
        // TypeScript options (see typescript docs) 
        module: "commonjs",
        target: "es5",
        includeDeclarations: true,

        // Output options (see typedoc docs) 
        out: "./docs",

        // TypeDoc options (see typedoc docs) 
        name: "GLAD (GitLab Auto Deploy)",
        theme: "./node_modules/typedoc-default-themes/bin/minimal",
        ignoreCompilerErrors: false,
        version: false
    }));
});

gulp.task('watch', function() {
  gulp.watch('./src/**/*.ts', ['typescript']);
});

gulp.task('default', ['typescript', 'docs']);