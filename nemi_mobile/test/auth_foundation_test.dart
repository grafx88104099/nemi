import 'package:flutter_test/flutter_test.dart';

import 'package:nemi_mobile/features/auth/auth_validators.dart';

void main() {
  group('validateEmail', () {
    test('зөв и-мэйл → null', () {
      expect(validateEmail('ta@example.com'), isNull);
      expect(validateEmail('bold.baterdene@nemi.mn'), isNull);
      expect(validateEmail('  ta@example.com  '), isNull); // trim хийгддэг
    });

    test('хоосон → алдаа', () {
      expect(validateEmail(null), 'И-мэйлээ оруулна уу.');
      expect(validateEmail(''), 'И-мэйлээ оруулна уу.');
      expect(validateEmail('   '), 'И-мэйлээ оруулна уу.');
    });

    test('буруу формат → алдаа', () {
      expect(validateEmail('ta'), 'И-мэйл хаяг буруу байна.');
      expect(validateEmail('ta@example'), 'И-мэйл хаяг буруу байна.');
      expect(validateEmail('@example.com'), 'И-мэйл хаяг буруу байна.');
      expect(validateEmail('ta@.com'), 'И-мэйл хаяг буруу байна.');
      expect(validateEmail('ta example@x.mn'), 'И-мэйл хаяг буруу байна.');
      expect(validateEmail('ta@exam ple.com'), 'И-мэйл хаяг буруу байна.');
    });
  });

  group('validatePassword', () {
    test('6+ тэмдэгт → null (вебийн minLength=6-тай ижил)', () {
      expect(kMinPasswordLength, 6);
      expect(validatePassword('123456'), isNull);
      expect(validatePassword('nuutsug'), isNull);
    });

    test('хоосон → алдаа', () {
      expect(validatePassword(null), 'Нууц үгээ оруулна уу.');
      expect(validatePassword(''), 'Нууц үгээ оруулна уу.');
    });

    test('богино → алдаа', () {
      expect(validatePassword('12345'), 'Нууц үг хамгийн багадаа 6 тэмдэгт.');
      expect(validatePassword('a'), 'Нууц үг хамгийн багадаа 6 тэмдэгт.');
    });
  });

  group('validatePasswordConfirm', () {
    test('таарвал → null', () {
      expect(validatePasswordConfirm('nuutsug', 'nuutsug'), isNull);
    });

    test('хоосон давталт → алдаа', () {
      expect(
        validatePasswordConfirm('nuutsug', null),
        'Нууц үгээ давтан оруулна уу.',
      );
      expect(
        validatePasswordConfirm('nuutsug', ''),
        'Нууц үгээ давтан оруулна уу.',
      );
    });

    test('таарахгүй → алдаа', () {
      expect(
        validatePasswordConfirm('nuutsug', 'oor'),
        'Нууц үг таарахгүй байна.',
      );
    });
  });

  group('validateFullName', () {
    test('нэртэй → null', () {
      expect(validateFullName('Б. Болд'), isNull);
    });

    test('хоосон → алдаа', () {
      expect(validateFullName(null), 'Бүтэн нэрээ оруулна уу.');
      expect(validateFullName(''), 'Бүтэн нэрээ оруулна уу.');
      expect(validateFullName('   '), 'Бүтэн нэрээ оруулна уу.');
    });
  });
}
