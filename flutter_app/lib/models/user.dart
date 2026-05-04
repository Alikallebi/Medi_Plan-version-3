import 'dart:convert';

import '../utils/constants.dart';

class UserSession {
  const UserSession({
    required this.id,
    required this.email,
    required this.role,
    required this.token,
    this.nom,
    this.prenom,
    this.specialite,
    this.serviceId,
    this.serviceNom,
    this.poleId,
    this.poleNom,
    this.equipeId,
    this.equipeNom,
    this.telephone,
    this.adresse,
    this.photo,
    this.actif = true,
  });

  final int id;
  final String email;
  final String role;
  final String token;
  final String? nom;
  final String? prenom;
  final String? specialite;
  final int? serviceId;
  final String? serviceNom;
  final int? poleId;
  final String? poleNom;
  final int? equipeId;
  final String? equipeNom;
  final String? telephone;
  final String? adresse;
  final String? photo;
  final bool actif;

  String get displayName {
    final fullName = '${prenom ?? ''} ${nom ?? ''}'.trim();
    if (fullName.isNotEmpty) {
      return fullName;
    }
    return email;
  }

  String get normalizedRole => role.trim().toUpperCase().replaceAll('-', '_');

  bool get isManager {
    return AppConstants.managerRoles.contains(normalizedRole) ||
        normalizedRole.contains('CHEF') ||
        normalizedRole.contains('SUPER');
  }

  bool get isSuperAdmin => normalizedRole.contains('SUPER');

  UserSession copyWith({
    String? nom,
    String? prenom,
    String? specialite,
    int? serviceId,
    String? serviceNom,
    int? poleId,
    String? poleNom,
    int? equipeId,
    String? equipeNom,
    String? telephone,
    String? adresse,
    String? photo,
    bool? actif,
  }) {
    return UserSession(
      id: id,
      email: email,
      role: role,
      token: token,
      nom: nom ?? this.nom,
      prenom: prenom ?? this.prenom,
      specialite: specialite ?? this.specialite,
      serviceId: serviceId ?? this.serviceId,
      serviceNom: serviceNom ?? this.serviceNom,
      poleId: poleId ?? this.poleId,
      poleNom: poleNom ?? this.poleNom,
      equipeId: equipeId ?? this.equipeId,
      equipeNom: equipeNom ?? this.equipeNom,
      telephone: telephone ?? this.telephone,
      adresse: adresse ?? this.adresse,
      photo: photo ?? this.photo,
      actif: actif ?? this.actif,
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'id': id,
      'email': email,
      'role': role,
      'token': token,
      'nom': nom,
      'prenom': prenom,
      'specialite': specialite,
      'serviceId': serviceId,
      'serviceNom': serviceNom,
      'poleId': poleId,
      'poleNom': poleNom,
      'equipeId': equipeId,
      'equipeNom': equipeNom,
      'telephone': telephone,
      'adresse': adresse,
      'photo': photo,
      'actif': actif,
    };
  }

  factory UserSession.fromJson(Map<String, dynamic> json) {
    return UserSession(
      id: _asInt(json['id']) ?? 0,
      email: json['email']?.toString() ?? '',
      role: json['role']?.toString() ?? 'STAFF',
      token: json['token']?.toString() ?? '',
      nom: json['nom']?.toString(),
      prenom: json['prenom']?.toString(),
      specialite: json['specialite']?.toString(),
      serviceId: _asInt(json['serviceId']),
      serviceNom: json['serviceNom']?.toString(),
      poleId: _asInt(json['poleId']),
      poleNom: json['poleNom']?.toString(),
      equipeId: _asInt(json['equipeId']),
      equipeNom: json['equipeNom']?.toString(),
      telephone: json['telephone']?.toString() ?? json['tel']?.toString(),
      adresse: json['adresse']?.toString(),
      photo: json['photo']?.toString(),
      actif: json['actif'] is bool ? json['actif'] as bool : true,
    );
  }

  String encode() => jsonEncode(toJson());

  factory UserSession.decode(String raw) {
    return UserSession.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  static int? _asInt(dynamic value) {
    if (value is int) {
      return value;
    }
    return int.tryParse(value?.toString() ?? '');
  }
}
