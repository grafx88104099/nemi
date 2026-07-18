import 'package:flutter_test/flutter_test.dart';
import 'package:nemi_mobile/core/app_config.dart';

void main() {
  group('compareSemver', () {
    test('тэнцүү', () {
      expect(compareSemver('1.0.0', '1.0.0'), 0);
      expect(compareSemver('2.10.3', '2.10.3'), 0);
    });

    test('patch ялгаа', () {
      expect(compareSemver('1.0.0', '1.0.1'), lessThan(0));
      expect(compareSemver('1.0.2', '1.0.1'), greaterThan(0));
    });

    test('minor ялгаа', () {
      expect(compareSemver('1.1.0', '1.2.0'), lessThan(0));
      expect(compareSemver('1.3.0', '1.2.9'), greaterThan(0));
    });

    test('major ялгаа', () {
      expect(compareSemver('1.9.9', '2.0.0'), lessThan(0));
      expect(compareSemver('3.0.0', '2.99.99'), greaterThan(0));
    });

    test('дутуу хэсэг → 0 гэж үзнэ', () {
      expect(compareSemver('1.0', '1.0.0'), 0);
      expect(compareSemver('1', '1.0.0'), 0);
      expect(compareSemver('1.2', '1.2.1'), lessThan(0));
    });

    test('build/pre-release хэсгийг хаяна', () {
      expect(compareSemver('1.2.3+45', '1.2.3'), 0);
      expect(compareSemver('1.2.3-beta', '1.2.3'), 0);
    });

    test('тоон биш утга → FormatException (дуудагч fail-open барина)', () {
      expect(() => compareSemver('abc', '1.0.0'), throwsFormatException);
      expect(() => compareSemver('1.0.0', 'x.y.z'), throwsFormatException);
      expect(() => compareSemver('', '1.0.0'), throwsFormatException);
      expect(() => compareSemver('1.2.3.4', '1.0.0'), throwsFormatException);
    });
  });
}
